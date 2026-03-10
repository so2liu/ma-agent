import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { startStaticAppServer } from './http-server';
import type { SandboxApp, SandboxRequest, SandboxResponse } from './types';

function createMockSandbox(): SandboxApp {
  return {
    handleRequest: async (req: SandboxRequest): Promise<SandboxResponse> => ({
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: req.method, path: req.path })
    }),
    dispose: () => {}
  };
}

describe('startStaticAppServer', () => {
  let distDir: string;

  beforeEach(() => {
    distDir = mkdtempSync(join(tmpdir(), 'static-server-test-'));
    mkdirSync(join(distDir, 'assets'), { recursive: true });
    writeFileSync(join(distDir, 'index.html'), '<html><body>Built App</body></html>');
    writeFileSync(join(distDir, 'assets', 'main.js'), 'console.log("hello");');
    writeFileSync(join(distDir, 'assets', 'style.css'), 'body { color: red; }');
  });

  afterEach(() => {
    if (existsSync(distDir)) {
      rmSync(distDir, { recursive: true });
    }
  });

  test('serves index.html at root', async () => {
    const sandbox = createMockSandbox();
    const server = await startStaticAppServer(distDir, sandbox);

    try {
      const res = await fetch(server.localUrl);
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain('Built App');
    } finally {
      await server.stop();
    }
  });

  test('serves static JS files', async () => {
    const sandbox = createMockSandbox();
    const server = await startStaticAppServer(distDir, sandbox);

    try {
      const res = await fetch(`${server.localUrl}/assets/main.js`);
      expect(res.status).toBe(200);
      const contentType = res.headers.get('content-type');
      expect(contentType).toBe('application/javascript');
      const text = await res.text();
      expect(text).toContain('console.log');
    } finally {
      await server.stop();
    }
  });

  test('serves static CSS files', async () => {
    const sandbox = createMockSandbox();
    const server = await startStaticAppServer(distDir, sandbox);

    try {
      const res = await fetch(`${server.localUrl}/assets/style.css`);
      expect(res.status).toBe(200);
      const contentType = res.headers.get('content-type');
      expect(contentType).toBe('text/css');
    } finally {
      await server.stop();
    }
  });

  test('routes /api/ to sandbox', async () => {
    const sandbox = createMockSandbox();
    const server = await startStaticAppServer(distDir, sandbox);

    try {
      const res = await fetch(`${server.localUrl}/api/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'test' })
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.method).toBe('POST');
      expect(body.path).toBe('/api/items');
    } finally {
      await server.stop();
    }
  });

  test('SPA fallback serves index.html for unknown routes', async () => {
    const sandbox = createMockSandbox();
    const server = await startStaticAppServer(distDir, sandbox);

    try {
      const res = await fetch(`${server.localUrl}/some/deep/route`);
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain('Built App');
    } finally {
      await server.stop();
    }
  });

  test('hashed assets get immutable cache headers', async () => {
    const sandbox = createMockSandbox();
    const server = await startStaticAppServer(distDir, sandbox);

    try {
      const res = await fetch(`${server.localUrl}/assets/main.js`);
      const cacheControl = res.headers.get('cache-control');
      expect(cacheControl).toContain('immutable');
    } finally {
      await server.stop();
    }
  });
});
