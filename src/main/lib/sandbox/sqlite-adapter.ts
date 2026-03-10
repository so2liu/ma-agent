/**
 * SQLite adapter that works in both Bun (tests) and Node.js (Electron).
 * Uses bun:sqlite when running under Bun, better-sqlite3 when running under Node.js.
 */

export interface SqliteStatement {
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
  run(...params: unknown[]): { changes: number };
}

export interface SqliteDatabase {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
  close(): void;
  pragma(pragma: string): unknown;
}

function isBunRuntime(): boolean {
  return typeof globalThis.Bun !== 'undefined';
}

export function openDatabase(path: string, options?: { readonly?: boolean }): SqliteDatabase {
  if (isBunRuntime()) {
    return openBunSqlite(path, options);
  }
  return openBetterSqlite3(path, options);
}

function openBunSqlite(path: string, options?: { readonly?: boolean }): SqliteDatabase {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('bun:sqlite');
  const Database = mod.Database;
  const db =
    options?.readonly ?
      new Database(path, { readonly: true })
    : new Database(path, { create: true, readwrite: true });

  return {
    exec: (sql: string) => db.exec(sql),
    prepare: (sql: string) => {
      const stmt = db.prepare(sql);
      return {
        all: (...params: unknown[]) => stmt.all(...params),
        get: (...params: unknown[]) => stmt.get(...params),
        run: (...params: unknown[]) => {
          const result = stmt.run(...params);
          return { changes: (result as { changes: number })?.changes ?? 0 };
        }
      };
    },
    close: () => db.close(),
    pragma: (pragma: string) => db.exec(`PRAGMA ${pragma}`)
  };
}

function openBetterSqlite3(path: string, options?: { readonly?: boolean }): SqliteDatabase {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const BetterSqlite3 = require('better-sqlite3');
  const db = new BetterSqlite3(path, { readonly: options?.readonly ?? false });

  return {
    exec: (sql: string) => db.exec(sql),
    prepare: (sql: string) => {
      const stmt = db.prepare(sql);
      return {
        all: (...params: unknown[]) => stmt.all(...params),
        get: (...params: unknown[]) => stmt.get(...params),
        run: (...params: unknown[]) => {
          const result = stmt.run(...params);
          return { changes: result.changes };
        }
      };
    },
    close: () => db.close(),
    pragma: (pragma: string) => db.pragma(pragma)
  };
}
