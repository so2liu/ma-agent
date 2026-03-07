import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

export interface DBApi {
  getAll: () => Record<string, unknown>[];
  getById: (id: string) => Record<string, unknown> | null;
  insert: (record: Record<string, unknown>) => Record<string, unknown>;
  update: (id: string, data: Record<string, unknown>) => boolean;
  remove: (id: string) => boolean;
  query: (filter: Record<string, unknown>) => Record<string, unknown>[];
}

export interface LoggerApi {
  info: (msg: string) => void;
  error: (msg: string) => void;
}

function loadData(dataPath: string): Record<string, unknown>[] {
  try {
    return JSON.parse(readFileSync(dataPath, 'utf-8')) as Record<string, unknown>[];
  } catch {
    return [];
  }
}

function saveData(dataPath: string, records: Record<string, unknown>[]): void {
  writeFileSync(dataPath, JSON.stringify(records, null, 2));
}

export function replaceAll(dataPath: string, records: Record<string, unknown>[]): void {
  saveData(dataPath, records);
}

export function createDBApi(dataPath: string): DBApi {
  return {
    getAll: () => loadData(dataPath),

    getById: (id: string) => loadData(dataPath).find((r) => r.id === id) ?? null,

    insert: (record: Record<string, unknown>) => {
      const records = loadData(dataPath);
      const newRecord = {
        ...record,
        id: randomUUID(),
        createdAt: new Date().toISOString()
      };
      records.push(newRecord);
      saveData(dataPath, records);
      return newRecord;
    },

    update: (id: string, data: Record<string, unknown>) => {
      const records = loadData(dataPath);
      const idx = records.findIndex((r) => r.id === id);
      if (idx === -1) return false;
      records[idx] = { ...records[idx], ...data, id };
      saveData(dataPath, records);
      return true;
    },

    remove: (id: string) => {
      const records = loadData(dataPath);
      const filtered = records.filter((r) => r.id !== id);
      if (filtered.length === records.length) return false;
      saveData(dataPath, filtered);
      return true;
    },

    query: (filter: Record<string, unknown>) => {
      return loadData(dataPath).filter((record) =>
        Object.entries(filter).every(([k, v]) => record[k] === v)
      );
    }
  };
}

export function createLoggerApi(appId: string): LoggerApi {
  return {
    info: (msg: string) => console.log(`[app:${appId}] ${msg}`),
    error: (msg: string) => console.error(`[app:${appId}] ${msg}`)
  };
}
