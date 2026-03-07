import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import type { AppInfo } from './types';

// We test the utility functions and scanApps logic by importing the module
// Since AppManager is a singleton, we re-import for fresh state
// For unit tests, we focus on scanApps behavior and scaffolding detection

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

  // Helper to create a legacy app (raw HTML)
  function createLegacyApp(name: string) {
    const appDir = join(appsDir, name);
    mkdirSync(appDir, { recursive: true });
    writeFileSync(
      join(appDir, 'app.json'),
      JSON.stringify({ name, description: 'A legacy app', version: '1.0.0', icon: '📱' })
    );
    writeFileSync(join(appDir, 'index.html'), '<html><body>Hello</body></html>');
    writeFileSync(
      join(appDir, 'server.js'),
      'function handleRequest(req) { return { status: 200, headers: {}, body: "ok" }; }'
    );
  }

  // Helper to create a Vite app (React)
  function createViteApp(name: string) {
    const appDir = join(appsDir, name);
    mkdirSync(join(appDir, 'src'), { recursive: true });
    writeFileSync(
      join(appDir, 'app.json'),
      JSON.stringify({ name, description: 'A Vite app', version: '1.0.0', icon: '⚛️' })
    );
    writeFileSync(
      join(appDir, 'src', 'App.tsx'),
      'export default function App() { return <div>Hello</div>; }'
    );
    writeFileSync(
      join(appDir, 'server.js'),
      'function handleRequest(req) { return { status: 200, headers: {}, body: "ok" }; }'
    );
  }

  test('returns empty array when apps dir does not exist', async () => {
    const { appManager } = await import('./app-manager');
    const result = appManager.scanApps(join(tempDir, 'nonexistent'));
    expect(result).toEqual([]);
  });

  test('detects legacy apps with isViteApp=false', async () => {
    createLegacyApp('my-legacy-app');
    const { appManager } = await import('./app-manager');
    const apps = appManager.scanApps(tempDir);
    const app = apps.find((a: AppInfo) => a.id === 'my-legacy-app');
    expect(app).toBeDefined();
    expect(app!.isViteApp).toBe(false);
    expect(app!.status).toBe('stopped');
  });

  test('detects Vite apps with isViteApp=true', async () => {
    createViteApp('my-vite-app');
    const { appManager } = await import('./app-manager');
    const apps = appManager.scanApps(tempDir);
    const app = apps.find((a: AppInfo) => a.id === 'my-vite-app');
    expect(app).toBeDefined();
    expect(app!.isViteApp).toBe(true);
  });

  test('scans multiple apps of both types', async () => {
    createLegacyApp('legacy-1');
    createViteApp('vite-1');
    createViteApp('vite-2');
    const { appManager } = await import('./app-manager');
    const apps = appManager.scanApps(tempDir);
    expect(apps.length).toBeGreaterThanOrEqual(3);

    const legacy = apps.find((a: AppInfo) => a.id === 'legacy-1');
    const vite1 = apps.find((a: AppInfo) => a.id === 'vite-1');
    const vite2 = apps.find((a: AppInfo) => a.id === 'vite-2');

    expect(legacy!.isViteApp).toBe(false);
    expect(vite1!.isViteApp).toBe(true);
    expect(vite2!.isViteApp).toBe(true);
  });

  test('skips directories without app.json', async () => {
    mkdirSync(join(appsDir, 'no-manifest'));
    const { appManager } = await import('./app-manager');
    const apps = appManager.scanApps(tempDir);
    const noManifest = apps.find((a: AppInfo) => a.id === 'no-manifest');
    expect(noManifest).toBeUndefined();
  });

  test('reads manifest fields correctly', async () => {
    createViteApp('test-fields');
    const { appManager } = await import('./app-manager');
    const apps = appManager.scanApps(tempDir);
    const app = apps.find((a: AppInfo) => a.id === 'test-fields');
    expect(app!.name).toBe('test-fields');
    expect(app!.description).toBe('A Vite app');
    expect(app!.icon).toBe('⚛️');
  });
});

describe('scaffolding', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'scaffold-test-'));
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true });
    }
  });

  test('template directory exists', () => {
    // The template should exist relative to the project root
    const templatePath = join(__dirname, '../../../../resources/app-template');
    expect(existsSync(templatePath)).toBe(true);
    expect(existsSync(join(templatePath, 'package.json'))).toBe(true);
    expect(existsSync(join(templatePath, 'vite.config.ts'))).toBe(true);
    expect(existsSync(join(templatePath, 'tsconfig.json'))).toBe(true);
    expect(existsSync(join(templatePath, 'index.html'))).toBe(true);
    expect(existsSync(join(templatePath, 'src', 'main.tsx'))).toBe(true);
    expect(existsSync(join(templatePath, 'src', 'index.css'))).toBe(true);
  });

  test('template package.json has correct dependencies', () => {
    const templatePath = join(__dirname, '../../../../resources/app-template');
    const pkg = JSON.parse(readFileSync(join(templatePath, 'package.json'), 'utf-8'));
    expect(pkg.dependencies.react).toBeDefined();
    expect(pkg.dependencies['react-dom']).toBeDefined();
    expect(pkg.dependencies['@tanstack/react-query']).toBeDefined();
    expect(pkg.devDependencies.vite).toBeDefined();
    expect(pkg.devDependencies.tailwindcss).toBeDefined();
    expect(pkg.devDependencies['@vitejs/plugin-react']).toBeDefined();
  });
});
