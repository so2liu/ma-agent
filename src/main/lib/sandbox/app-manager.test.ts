import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import type { AppInfo } from './types';

describe('AppManager.scanApps', () => {
  let tempDir: string;
  let appsDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'app-manager-test-'));
    appsDir = join(tempDir, 'apps');
    mkdirSync(appsDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true });
    }
  });

  function createApp(name: string, opts?: { conversationId?: string }) {
    const appDir = join(appsDir, name);
    mkdirSync(join(appDir, 'src', 'server'), { recursive: true });
    writeFileSync(
      join(appDir, 'app.json'),
      JSON.stringify({
        name,
        description: 'A test app',
        version: '1.0.0',
        icon: '⚛️',
        ...(opts?.conversationId ? { conversationId: opts.conversationId } : {})
      })
    );
    writeFileSync(
      join(appDir, 'src', 'App.tsx'),
      'export default function App() { return <div>Hello</div>; }'
    );
    writeFileSync(join(appDir, 'src', 'server', 'index.ts'), 'export default { fetch: () => {} }');
  }

  test('returns empty array when apps dir does not exist', async () => {
    const { appManager } = await import('./app-manager');
    const result = appManager.scanApps(join(tempDir, 'nonexistent'));
    expect(result).toEqual([]);
  });

  test('detects apps with stopped status', async () => {
    createApp('my-app');
    const { appManager } = await import('./app-manager');
    const apps = appManager.scanApps(tempDir);
    const app = apps.find((a: AppInfo) => a.id === 'my-app');
    expect(app).toBeDefined();
    expect(app!.status).toBe('stopped');
  });

  test('scans multiple apps', async () => {
    createApp('app-1');
    createApp('app-2');
    const { appManager } = await import('./app-manager');
    const apps = appManager.scanApps(tempDir);
    expect(apps.length).toBeGreaterThanOrEqual(2);
  });

  test('skips directories without app.json', async () => {
    mkdirSync(join(appsDir, 'no-manifest'));
    const { appManager } = await import('./app-manager');
    const apps = appManager.scanApps(tempDir);
    const noManifest = apps.find((a: AppInfo) => a.id === 'no-manifest');
    expect(noManifest).toBeUndefined();
  });

  test('reads manifest fields correctly', async () => {
    createApp('test-fields');
    const { appManager } = await import('./app-manager');
    const apps = appManager.scanApps(tempDir);
    const app = apps.find((a: AppInfo) => a.id === 'test-fields');
    expect(app!.name).toBe('test-fields');
    expect(app!.description).toBe('A test app');
    expect(app!.icon).toBe('⚛️');
  });

  test('reads conversationId from manifest', async () => {
    createApp('linked-app', { conversationId: 'conv-123' });
    const { appManager } = await import('./app-manager');
    const apps = appManager.scanApps(tempDir);
    const app = apps.find((a: AppInfo) => a.id === 'linked-app');
    expect(app!.conversationId).toBe('conv-123');
  });

  test('conversationId is null when not set', async () => {
    createApp('unlinked-app');
    const { appManager } = await import('./app-manager');
    const apps = appManager.scanApps(tempDir);
    const app = apps.find((a: AppInfo) => a.id === 'unlinked-app');
    expect(app!.conversationId).toBeNull();
  });

  test('setConversationId writes to app.json', async () => {
    createApp('stamp-app');
    const { appManager } = await import('./app-manager');
    appManager.setConversationId(tempDir, 'stamp-app', 'conv-456');
    const meta = JSON.parse(readFileSync(join(appsDir, 'stamp-app', 'app.json'), 'utf-8'));
    expect(meta.conversationId).toBe('conv-456');
  });
});
