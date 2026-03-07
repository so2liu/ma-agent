import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { createSandboxApp } from './quickjs-runtime';

describe('createSandboxApp', () => {
  let tempDir: string;
  let dataPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'quickjs-test-'));
    dataPath = join(tempDir, 'data.json');
    writeFileSync(dataPath, '[]');
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true });
    }
  });

  test('handles a simple GET request', async () => {
    const backendCode = `
      function handleRequest(req) {
        return {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: 'hello' })
        }
      }
    `;

    const app = await createSandboxApp(backendCode, 'test-app', dataPath);

    const res = await app.handleRequest({
      method: 'GET',
      path: '/api/hello',
      headers: {},
      body: null
    });

    expect(res.status).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.message).toBe('hello');

    app.dispose();
  });

  test('handles POST with body parsing', async () => {
    const backendCode = `
      function handleRequest(req) {
        if (req.method === 'POST') {
          var data = JSON.parse(req.body);
          return {
            status: 201,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ received: data.name })
          }
        }
        return { status: 404, headers: {}, body: 'Not Found' }
      }
    `;

    const app = await createSandboxApp(backendCode, 'test-post', dataPath);

    const res = await app.handleRequest({
      method: 'POST',
      path: '/api/items',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'test-item' })
    });

    expect(res.status).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.received).toBe('test-item');

    app.dispose();
  });

  test('uses DB API to persist data', async () => {
    const backendCode = `
      function handleRequest(req) {
        if (req.method === 'POST') {
          var data = JSON.parse(req.body);
          var record = DB.insert(data);
          return {
            status: 201,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(record)
          }
        }
        if (req.method === 'GET') {
          var all = DB.getAll();
          return {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(all)
          }
        }
        return { status: 404, headers: {}, body: '' }
      }
    `;

    const app = await createSandboxApp(backendCode, 'test-db', dataPath);

    // Insert
    const insertRes = await app.handleRequest({
      method: 'POST',
      path: '/api/items',
      headers: {},
      body: JSON.stringify({ name: 'Alice' })
    });
    expect(insertRes.status).toBe(201);
    const inserted = JSON.parse(insertRes.body);
    expect(inserted.name).toBe('Alice');
    expect(inserted.id).toBeDefined();

    // Get all — should see the persisted record
    const getRes = await app.handleRequest({
      method: 'GET',
      path: '/api/items',
      headers: {},
      body: null
    });
    expect(getRes.status).toBe(200);
    const items = JSON.parse(getRes.body);
    expect(items).toHaveLength(1);

    app.dispose();
  });

  test('returns 500 for code with errors', async () => {
    const backendCode = `
      function handleRequest(req) {
        throw new Error('intentional error');
      }
    `;

    const app = await createSandboxApp(backendCode, 'test-error', dataPath);

    const res = await app.handleRequest({
      method: 'GET',
      path: '/api/test',
      headers: {},
      body: null
    });

    expect(res.status).toBe(500);

    app.dispose();
  });
});
