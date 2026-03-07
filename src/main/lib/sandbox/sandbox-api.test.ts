import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { createDBApi } from './sandbox-api';

describe('createDBApi', () => {
  let tempDir: string;
  let dataPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'sandbox-test-'));
    dataPath = join(tempDir, 'data.json');
    writeFileSync(dataPath, '[]');
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true });
    }
  });

  test('getAll returns empty array initially', () => {
    const db = createDBApi(dataPath);
    expect(db.getAll()).toEqual([]);
  });

  test('insert adds record with id and createdAt', () => {
    const db = createDBApi(dataPath);
    const record = db.insert({ name: 'Alice', employeeId: '001' });

    expect(record.name).toBe('Alice');
    expect(record.employeeId).toBe('001');
    expect(record.id).toBeDefined();
    expect(record.createdAt).toBeDefined();
  });

  test('getAll returns inserted records', () => {
    const db = createDBApi(dataPath);
    db.insert({ name: 'Alice' });
    db.insert({ name: 'Bob' });

    const all = db.getAll();
    expect(all).toHaveLength(2);
  });

  test('getById finds record', () => {
    const db = createDBApi(dataPath);
    const inserted = db.insert({ name: 'Alice' });

    const found = db.getById(inserted.id as string);
    expect(found).not.toBeNull();
    expect(found?.name).toBe('Alice');
  });

  test('getById returns null for missing id', () => {
    const db = createDBApi(dataPath);
    expect(db.getById('nonexistent')).toBeNull();
  });

  test('update modifies record', () => {
    const db = createDBApi(dataPath);
    const inserted = db.insert({ name: 'Alice' });

    const result = db.update(inserted.id as string, { name: 'Alice Updated' });
    expect(result).toBe(true);

    const updated = db.getById(inserted.id as string);
    expect(updated?.name).toBe('Alice Updated');
  });

  test('update returns false for missing id', () => {
    const db = createDBApi(dataPath);
    expect(db.update('nonexistent', { name: 'x' })).toBe(false);
  });

  test('remove deletes record', () => {
    const db = createDBApi(dataPath);
    const inserted = db.insert({ name: 'Alice' });

    const result = db.remove(inserted.id as string);
    expect(result).toBe(true);
    expect(db.getAll()).toHaveLength(0);
  });

  test('remove returns false for missing id', () => {
    const db = createDBApi(dataPath);
    expect(db.remove('nonexistent')).toBe(false);
  });

  test('query filters by field value', () => {
    const db = createDBApi(dataPath);
    db.insert({ name: 'Alice', dept: 'eng' });
    db.insert({ name: 'Bob', dept: 'sales' });
    db.insert({ name: 'Carol', dept: 'eng' });

    const engineers = db.query({ dept: 'eng' });
    expect(engineers).toHaveLength(2);
  });

  test('data persists to disk', () => {
    const db = createDBApi(dataPath);
    db.insert({ name: 'Alice' });

    // Read directly from file
    const raw = JSON.parse(readFileSync(dataPath, 'utf-8'));
    expect(raw).toHaveLength(1);
    expect(raw[0].name).toBe('Alice');
  });
});
