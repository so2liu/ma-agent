import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { createDBApi, migrateJsonToSqlite } from './sandbox-api';

describe('createDBApi', () => {
  let tempDir: string;
  let dataPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'sandbox-test-'));
    dataPath = join(tempDir, 'data.sqlite');
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true });
    }
  });

  test('getAll returns empty array initially', () => {
    const db = createDBApi(dataPath);
    expect(db.getAll()).toEqual([]);
    db.close();
  });

  test('insert adds record with id and createdAt', () => {
    const db = createDBApi(dataPath);
    const record = db.insert({ name: 'Alice', employeeId: '001' });

    expect(record.name).toBe('Alice');
    expect(record.employeeId).toBe('001');
    expect(record.id).toBeDefined();
    expect(record.createdAt).toBeDefined();
    db.close();
  });

  test('getAll returns inserted records', () => {
    const db = createDBApi(dataPath);
    db.insert({ name: 'Alice' });
    db.insert({ name: 'Bob' });

    const all = db.getAll();
    expect(all).toHaveLength(2);
    db.close();
  });

  test('getById finds record', () => {
    const db = createDBApi(dataPath);
    const inserted = db.insert({ name: 'Alice' });

    const found = db.getById(inserted.id as string);
    expect(found).not.toBeNull();
    expect(found?.name).toBe('Alice');
    db.close();
  });

  test('getById returns null for missing id', () => {
    const db = createDBApi(dataPath);
    expect(db.getById('nonexistent')).toBeNull();
    db.close();
  });

  test('update modifies record', () => {
    const db = createDBApi(dataPath);
    const inserted = db.insert({ name: 'Alice' });

    const result = db.update(inserted.id as string, { name: 'Alice Updated' });
    expect(result).toBe(true);

    const updated = db.getById(inserted.id as string);
    expect(updated?.name).toBe('Alice Updated');
    db.close();
  });

  test('update returns false for missing id', () => {
    const db = createDBApi(dataPath);
    expect(db.update('nonexistent', { name: 'x' })).toBe(false);
    db.close();
  });

  test('remove deletes record', () => {
    const db = createDBApi(dataPath);
    const inserted = db.insert({ name: 'Alice' });

    const result = db.remove(inserted.id as string);
    expect(result).toBe(true);
    expect(db.getAll()).toHaveLength(0);
    db.close();
  });

  test('remove returns false for missing id', () => {
    const db = createDBApi(dataPath);
    expect(db.remove('nonexistent')).toBe(false);
    db.close();
  });

  test('query filters by field value', () => {
    const db = createDBApi(dataPath);
    db.insert({ name: 'Alice', dept: 'eng' });
    db.insert({ name: 'Bob', dept: 'sales' });
    db.insert({ name: 'Carol', dept: 'eng' });

    const engineers = db.query({ dept: 'eng' });
    expect(engineers).toHaveLength(2);
    db.close();
  });

  test('data persists to sqlite file', () => {
    const db = createDBApi(dataPath);
    db.insert({ name: 'Alice' });
    db.close();

    const rawDb = new Database(dataPath, { readonly: true });
    const rows = rawDb.prepare('SELECT * FROM records').all();
    expect(rows).toHaveLength(1);
    rawDb.close();
  });
});

describe('migrateJsonToSqlite', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'migrate-test-'));
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true });
    }
  });

  test('migrates data.json to data.sqlite', () => {
    const jsonPath = join(tempDir, 'data.json');
    const sqlitePath = join(tempDir, 'data.sqlite');

    writeFileSync(
      jsonPath,
      JSON.stringify([
        { id: 'abc', name: 'Alice', createdAt: '2024-01-01T00:00:00Z' },
        { id: 'def', name: 'Bob', createdAt: '2024-01-02T00:00:00Z' }
      ])
    );

    migrateJsonToSqlite(jsonPath, sqlitePath);

    expect(existsSync(sqlitePath)).toBe(true);
    expect(existsSync(jsonPath)).toBe(false);

    const db = createDBApi(sqlitePath);
    const all = db.getAll();
    expect(all).toHaveLength(2);
    expect(all.find((r) => r.id === 'abc')?.name).toBe('Alice');
    db.close();
  });

  test('skips migration if sqlite already exists', () => {
    const jsonPath = join(tempDir, 'data.json');
    const sqlitePath = join(tempDir, 'data.sqlite');

    writeFileSync(
      jsonPath,
      JSON.stringify([{ id: 'abc', name: 'Alice', createdAt: '2024-01-01' }])
    );

    const db = createDBApi(sqlitePath);
    db.close();

    migrateJsonToSqlite(jsonPath, sqlitePath);

    expect(existsSync(jsonPath)).toBe(true);

    const db2 = createDBApi(sqlitePath);
    expect(db2.getAll()).toHaveLength(0);
    db2.close();
  });
});
