import { existsSync, mkdirSync } from 'fs';
import { appendFile } from 'fs/promises';
import { join } from 'path';
import { app } from 'electron';

let currentLogPath: string | null = null;

function getLogsDir(): string {
  const dir = join(app.getPath('userData'), 'session-logs');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function startSessionLog(sessionId: string): void {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${timestamp}_${sessionId}.jsonl`;
  currentLogPath = join(getLogsDir(), filename);
}

export function logSessionEvent(event: unknown): void {
  if (!currentLogPath) return;
  const line = JSON.stringify({ ts: Date.now(), event }) + '\n';
  appendFile(currentLogPath, line, 'utf-8').catch(() => {
    // Logging should never break the app
  });
}

export function endSessionLog(): void {
  if (currentLogPath) {
    logSessionEvent({ type: 'session_end' });
    currentLogPath = null;
  }
}
