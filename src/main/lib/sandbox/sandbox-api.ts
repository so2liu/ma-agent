import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';

import { openDatabase, type SqliteDatabase } from './sqlite-adapter';

export interface DBApi {
  getAll: () => Record<string, unknown>[];
  getById: (id: string) => Record<string, unknown> | null;
  insert: (record: Record<string, unknown>) => Record<string, unknown>;
  update: (id: string, data: Record<string, unknown>) => boolean;
  remove: (id: string) => boolean;
  query: (filter: Record<string, unknown>) => Record<string, unknown>[];
  close: () => void;
}

export interface LoggerApi {
  info: (msg: string) => void;
  error: (msg: string) => void;
}

function openDb(dbPath: string): SqliteDatabase {
  const db = openDatabase(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS records (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);
  return db;
}

function rowToRecord(row: { id: string; data: string; created_at: string }): Record<string, unknown> {
  const parsed = JSON.parse(row.data) as Record<string, unknown>;
  return { ...parsed, id: row.id, createdAt: row.created_at };
}

function recordToRow(record: Record<string, unknown>): { id: string; data: string; created_at: string } {
  const { id, createdAt, ...rest } = record;
  return {
    id: id as string,
    data: JSON.stringify(rest),
    created_at: createdAt as string
  };
}

/** Migrate data.json to data.sqlite if needed */
export function migrateJsonToSqlite(jsonPath: string, sqlitePath: string): void {
  if (!existsSync(jsonPath) || existsSync(sqlitePath)) return;

  let records: Record<string, unknown>[];
  try {
    records = JSON.parse(readFileSync(jsonPath, 'utf-8')) as Record<string, unknown>[];
  } catch {
    return;
  }

  if (!Array.isArray(records) || records.length === 0) return;

  const db = openDb(sqlitePath);
  const insertStmt = db.prepare('INSERT OR IGNORE INTO records (id, data, created_at) VALUES (?, ?, ?)');
  db.exec('BEGIN');
  for (const record of records) {
    const id = (record.id as string) || randomUUID();
    const createdAt = (record.createdAt as string) || new Date().toISOString();
    const { id: _id, createdAt: _ca, ...rest } = record;
    insertStmt.run(id, JSON.stringify(rest), createdAt);
  }
  db.exec('COMMIT');
  db.close();

  try {
    unlinkSync(jsonPath);
  } catch {
    // Ignore cleanup errors
  }
}

export function replaceAll(dbPath: string, records: Record<string, unknown>[]): void {
  const db = openDb(dbPath);
  db.exec('BEGIN');
  db.exec('DELETE FROM records');
  const stmt = db.prepare('INSERT INTO records (id, data, created_at) VALUES (?, ?, ?)');
  for (const record of records) {
    const row = recordToRow(record);
    stmt.run(row.id, row.data, row.created_at);
  }
  db.exec('COMMIT');
  db.close();
}

export function createDBApi(dbPath: string): DBApi {
  const db = openDb(dbPath);

  const stmts = {
    getAll: db.prepare('SELECT id, data, created_at FROM records'),
    getById: db.prepare('SELECT id, data, created_at FROM records WHERE id = ?'),
    insert: db.prepare('INSERT INTO records (id, data, created_at) VALUES (?, ?, ?)'),
    update: db.prepare('UPDATE records SET data = ? WHERE id = ?'),
    remove: db.prepare('DELETE FROM records WHERE id = ?'),
  };

  return {
    getAll: () => {
      const rows = stmts.getAll.all() as { id: string; data: string; created_at: string }[];
      return rows.map(rowToRecord);
    },

    getById: (id: string) => {
      const row = stmts.getById.get(id) as { id: string; data: string; created_at: string } | undefined;
      return row ? rowToRecord(row) : null;
    },

    insert: (record: Record<string, unknown>) => {
      const id = randomUUID();
      const createdAt = new Date().toISOString();
      const { id: _id, createdAt: _ca, ...rest } = record;
      stmts.insert.run(id, JSON.stringify(rest), createdAt);
      return { ...rest, id, createdAt };
    },

    update: (id: string, data: Record<string, unknown>) => {
      const existing = stmts.getById.get(id) as { id: string; data: string; created_at: string } | undefined;
      if (!existing) return false;
      const parsed = JSON.parse(existing.data) as Record<string, unknown>;
      const { id: _id, createdAt: _ca, ...rest } = data;
      const merged = { ...parsed, ...rest };
      stmts.update.run(JSON.stringify(merged), id);
      return true;
    },

    remove: (id: string) => {
      const result = stmts.remove.run(id);
      return result.changes > 0;
    },

    query: (filter: Record<string, unknown>) => {
      const rows = stmts.getAll.all() as { id: string; data: string; created_at: string }[];
      return rows
        .map(rowToRecord)
        .filter((record) =>
          Object.entries(filter).every(([k, v]) => record[k] === v)
        );
    },

    close: () => {
      db.close();
    }
  };
}

export function createLoggerApi(appId: string): LoggerApi {
  return {
    info: (msg: string) => console.log(`[app:${appId}] ${msg}`),
    error: (msg: string) => console.error(`[app:${appId}] ${msg}`)
  };
}
