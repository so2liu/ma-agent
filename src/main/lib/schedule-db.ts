import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { app } from 'electron';

import type { ChatModelPreference } from '../../shared/types/ipc';

export interface ScheduledTask {
  id: string;
  name: string;
  prompt: string;
  cronExpression: string;
  enabled: boolean;
  modelPreference: ChatModelPreference;
  lastRunAt?: number;
  lastRunStatus?: 'success' | 'error' | 'skipped';
  lastRunConversationId?: string;
  createdAt: number;
  updatedAt: number;
}

let filePath: string | null = null;

function getFilePath(): string {
  if (!filePath) {
    filePath = join(app.getPath('userData'), 'schedules.json');
  }
  return filePath;
}

let lastReadFailed = false;

function readAll(): ScheduledTask[] {
  const fp = getFilePath();
  if (!existsSync(fp)) return [];
  try {
    const tasks = JSON.parse(readFileSync(fp, 'utf-8')) as ScheduledTask[];
    lastReadFailed = false;
    return tasks;
  } catch (error) {
    console.error('Failed to parse schedules.json:', error);
    lastReadFailed = true;
    return [];
  }
}

function writeAll(tasks: ScheduledTask[]): void {
  if (lastReadFailed && tasks.length === 0) {
    console.error('Refusing to overwrite schedules.json with empty data after parse failure');
    return;
  }
  writeFileSync(getFilePath(), JSON.stringify(tasks, null, 2), 'utf-8');
}

export function listScheduledTasks(): ScheduledTask[] {
  return readAll().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getScheduledTask(id: string): ScheduledTask | null {
  return readAll().find((t) => t.id === id) ?? null;
}

export function createScheduledTask(data: {
  name: string;
  prompt: string;
  cronExpression: string;
  modelPreference: ChatModelPreference;
}): ScheduledTask {
  const tasks = readAll();
  const now = Date.now();
  const task: ScheduledTask = {
    id: crypto.randomUUID(),
    ...data,
    enabled: true,
    createdAt: now,
    updatedAt: now,
  };
  tasks.push(task);
  writeAll(tasks);
  return task;
}

export function updateScheduledTask(
  id: string,
  updates: Partial<
    Pick<
      ScheduledTask,
      | 'name'
      | 'prompt'
      | 'cronExpression'
      | 'enabled'
      | 'modelPreference'
      | 'lastRunAt'
      | 'lastRunStatus'
      | 'lastRunConversationId'
    >
  >
): ScheduledTask {
  const tasks = readAll();
  const index = tasks.findIndex((t) => t.id === id);
  if (index === -1) throw new Error(`Scheduled task ${id} not found`);
  Object.assign(tasks[index], updates, { updatedAt: Date.now() });
  writeAll(tasks);
  return tasks[index];
}

export function deleteScheduledTask(id: string): void {
  const tasks = readAll().filter((t) => t.id !== id);
  writeAll(tasks);
}
