import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { ipcMain } from 'electron';

import { getWorkspaceDir } from '../lib/config';
import { appManager } from '../lib/sandbox/app-manager';
import { migrateJsonToSqlite } from '../lib/sandbox/sandbox-api';
import { openDatabase, type SqliteDatabase } from '../lib/sandbox/sqlite-adapter';

function getAppDir(appId: string): string {
  if (typeof appId !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(appId)) {
    throw new Error('Invalid appId');
  }
  return join(getWorkspaceDir(), 'apps', appId);
}

function getDbPath(appId: string): string {
  const appDir = getAppDir(appId);
  const dbPath = join(appDir, 'data.sqlite');
  if (!existsSync(dbPath)) {
    throw new Error(`Database not found for app "${appId}"`);
  }
  return dbPath;
}

function assertAppNotRunning(appId: string): void {
  const apps = appManager.scanApps(getWorkspaceDir());
  const app = apps.find((a) => a.id === appId);
  const status = app?.status ?? 'stopped';
  if (status === 'running' || status === 'developing') {
    throw new Error('Cannot modify database while app is running');
  }
}

function openReadonly(dbPath: string): SqliteDatabase {
  return openDatabase(dbPath, { readonly: true });
}

function openReadWrite(dbPath: string): SqliteDatabase {
  return openDatabase(dbPath);
}

function withDb<T>(dbPath: string, readonly: boolean, fn: (db: SqliteDatabase) => T): T {
  const db = readonly ? openReadonly(dbPath) : openReadWrite(dbPath);
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

/** Check if this is the sandbox's records table (has id PK + data JSON + created_at) */
function isRecordsTable(db: SqliteDatabase, tableName: string): boolean {
  const cols = db.prepare(`PRAGMA table_info("${tableName}")`).all() as {
    name: string;
    pk: number;
  }[];
  const colNames = cols.map((c) => c.name);
  return colNames.includes('id') && colNames.includes('data') && colNames.includes('created_at');
}

/** Expand records table rows: parse the JSON `data` column into virtual columns */
function expandRecordRows(
  rows: Record<string, unknown>[]
): { expandedRows: Record<string, unknown>[]; virtualColumns: string[] } {
  const virtualColumnSet = new Set<string>();
  const expandedRows = rows.map((row) => {
    const result: Record<string, unknown> = {
      id: row.id,
      createdAt: row.created_at
    };
    if (typeof row.data === 'string') {
      try {
        const parsed = JSON.parse(row.data) as Record<string, unknown>;
        for (const [k, v] of Object.entries(parsed)) {
          result[k] = v;
          virtualColumnSet.add(k);
        }
      } catch {
        result._raw_data = row.data;
        virtualColumnSet.add('_raw_data');
      }
    }
    return result;
  });
  return { expandedRows, virtualColumns: [...virtualColumnSet] };
}

export function registerDbHandlers(): void {
  ipcMain.handle('db:get-tables', (_event, appId: unknown) => {
    try {
      const id = appId as string;
      const appDir = getAppDir(id);
      const jsonPath = join(appDir, 'data.json');
      const sqlitePath = join(appDir, 'data.sqlite');
      migrateJsonToSqlite(jsonPath, sqlitePath);
      const dbPath = getDbPath(id);
      return withDb(dbPath, true, (db) => {
        const tables = db
          .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
          .all() as { name: string }[];
        return { success: true, tables: tables.map((t) => t.name) };
      });
    } catch (error) {
      return { success: false, tables: [], error: String(error) };
    }
  });

  ipcMain.handle(
    'db:query-table',
    (_event, appId: unknown, table: unknown, page: unknown, pageSize: unknown) => {
      try {
        const dbPath = getDbPath(appId as string);
        const tableName = table as string;
        if (!/^[a-zA-Z0-9_]+$/.test(tableName)) {
          throw new Error('Invalid table name');
        }
        const p = Math.max(1, Number(page) || 1);
        const ps = Math.min(200, Math.max(1, Number(pageSize) || 50));
        const offset = (p - 1) * ps;

        return withDb(dbPath, true, (db) => {
          const countRow = db.prepare(`SELECT COUNT(*) as count FROM "${tableName}"`).get() as {
            count: number;
          };
          const rawRows = db
            .prepare(`SELECT * FROM "${tableName}" ORDER BY rowid LIMIT ? OFFSET ?`)
            .all(ps, offset) as Record<string, unknown>[];

          const columnsInfo = db.prepare(`PRAGMA table_info("${tableName}")`).all() as {
            name: string;
            type: string;
            pk: number;
          }[];

          // For the sandbox records table, expand JSON data into virtual columns
          if (isRecordsTable(db, tableName)) {
            const { expandedRows, virtualColumns } = expandRecordRows(rawRows);
            const cols = [
              { name: 'id', type: 'TEXT', pk: true },
              ...virtualColumns.map((name) => ({ name, type: '', pk: false })),
              { name: 'createdAt', type: 'TEXT', pk: false }
            ];
            return {
              success: true,
              rows: expandedRows,
              columns: cols,
              total: countRow.count,
              page: p,
              pageSize: ps,
              isRecordsTable: true
            };
          }

          return {
            success: true,
            rows: rawRows,
            columns: columnsInfo.map((c) => ({ name: c.name, type: c.type, pk: c.pk > 0 })),
            total: countRow.count,
            page: p,
            pageSize: ps,
            isRecordsTable: false
          };
        });
      } catch (error) {
        return { success: false, error: String(error) };
      }
    }
  );

  ipcMain.handle(
    'db:update-cell',
    (_event, appId: unknown, table: unknown, rowId: unknown, column: unknown, value: unknown) => {
      try {
        const id = appId as string;
        assertAppNotRunning(id);
        const dbPath = getDbPath(id);
        const tableName = table as string;
        const colName = column as string;
        if (!/^[a-zA-Z0-9_]+$/.test(tableName)) {
          throw new Error('Invalid table name');
        }

        return withDb(dbPath, false, (db) => {
          // For the sandbox records table, update the JSON data field
          if (isRecordsTable(db, tableName) && colName !== 'id' && colName !== 'createdAt') {
            const row = db.prepare(`SELECT data FROM "${tableName}" WHERE id = ?`).get(rowId) as
              | { data: string }
              | undefined;
            if (!row) throw new Error('Record not found');

            let parsed: Record<string, unknown>;
            try {
              parsed = JSON.parse(row.data) as Record<string, unknown>;
            } catch {
              parsed = {};
            }
            parsed[colName] = value;
            db.prepare(`UPDATE "${tableName}" SET data = ? WHERE id = ?`).run(
              JSON.stringify(parsed),
              rowId
            );
            return { success: true };
          }

          // Generic table update
          if (!/^[a-zA-Z0-9_]+$/.test(colName)) {
            throw new Error('Invalid column name');
          }
          const cols = db.prepare(`PRAGMA table_info("${tableName}")`).all() as {
            name: string;
            pk: number;
          }[];
          const pkCol = cols.find((c) => c.pk > 0);
          if (!pkCol) throw new Error('Table has no primary key');

          db.prepare(`UPDATE "${tableName}" SET "${colName}" = ? WHERE "${pkCol.name}" = ?`).run(
            value,
            rowId
          );
          return { success: true };
        });
      } catch (error) {
        return { success: false, error: String(error) };
      }
    }
  );

  ipcMain.handle('db:delete-row', (_event, appId: unknown, table: unknown, rowId: unknown) => {
    try {
      const id = appId as string;
      assertAppNotRunning(id);
      const dbPath = getDbPath(id);
      const tableName = table as string;
      if (!/^[a-zA-Z0-9_]+$/.test(tableName)) {
        throw new Error('Invalid table name');
      }

      return withDb(dbPath, false, (db) => {
        const cols = db.prepare(`PRAGMA table_info("${tableName}")`).all() as {
          name: string;
          pk: number;
        }[];
        const pkCol = cols.find((c) => c.pk > 0);
        if (!pkCol) throw new Error('Table has no primary key');

        const result = db
          .prepare(`DELETE FROM "${tableName}" WHERE "${pkCol.name}" = ?`)
          .run(rowId);
        return { success: true, deleted: result.changes > 0 };
      });
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('db:run-query', (_event, appId: unknown, sql: unknown) => {
    try {
      const dbPath = getDbPath(appId as string);
      const sqlStr = sql as string;

      // Only allow SELECT for safety
      if (!/^\s*SELECT\b/i.test(sqlStr)) {
        throw new Error('Only SELECT queries are allowed');
      }

      // Add LIMIT if not present to prevent main-thread blocking
      const trimmed = sqlStr.replace(/;\s*$/, '');
      const hasLimit = /\bLIMIT\b/i.test(trimmed);
      const safeSql = hasLimit ? trimmed : `${trimmed} LIMIT 1000`;

      return withDb(dbPath, true, (db) => {
        const rows = db.prepare(safeSql).all() as Record<string, unknown>[];

        const columns =
          rows.length > 0
            ? Object.keys(rows[0]).map((name) => ({ name, type: '', pk: false }))
            : [];

        return { success: true, rows, columns, total: rows.length };
      });
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('db:get-app-status', (_event, appId: unknown) => {
    try {
      const id = appId as string;
      if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(id)) {
        throw new Error('Invalid appId');
      }
      const workspaceDir = getWorkspaceDir();
      const apps = appManager.scanApps(workspaceDir);
      const app = apps.find((a) => a.id === id);
      return { success: true, status: app?.status ?? 'stopped' };
    } catch (error) {
      return { success: false, status: 'stopped', error: String(error) };
    }
  });
}
