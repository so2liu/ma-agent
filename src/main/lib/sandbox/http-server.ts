import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';

import type { SandboxApp, SandboxRequest } from './types';

export interface AppServer {
  port: number;
  lanUrl: string;
  localUrl: string;
  stop: () => Promise<void>;
}

const MAX_BODY_SIZE = 1024 * 1024; // 1MB limit

function readBody(req: import('node:http').IncomingMessage): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalSize = 0;
    req.on('data', (chunk: Buffer) => {
      totalSize += chunk.length;
      if (totalSize > MAX_BODY_SIZE) {
        req.destroy();
        reject(new Error('Request body too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) {
        resolve(null);
      } else {
        resolve(Buffer.concat(chunks).toString('utf-8'));
      }
    });
    req.on('error', () => resolve(null));
  });
}

async function findAvailablePort(startPort: number, endPort: number): Promise<number> {
  const net = await import('node:net');

  for (let port = startPort; port <= endPort; port++) {
    const available = await new Promise<boolean>((resolve) => {
      const server = net.createServer();
      server.once('error', () => resolve(false));
      server.once('listening', () => {
        server.close(() => resolve(true));
      });
      server.listen(port);
    });
    if (available) return port;
  }
  throw new Error(`No available port in range ${startPort}-${endPort}`);
}

function getLanIP(): string {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

export async function startAppServer(
  frontendHtml: string,
  sandboxApp: SandboxApp
): Promise<AppServer> {
  const port = await findAvailablePort(3456, 3500);

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://localhost:${String(port)}`);

    // CORS headers - restrict to same-origin (LAN app served from same host)
    const origin = req.headers.origin;
    const allowedOrigin = origin && /^http:\/\/(localhost|127\.0\.0\.1|\d+\.\d+\.\d+\.\d+):\d+$/.test(origin) ? origin : null;
    if (allowedOrigin) {
      res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Serve frontend
    if (url.pathname === '/' || url.pathname === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(frontendHtml);
      return;
    }

    // API routes → sandbox
    if (url.pathname.startsWith('/api/')) {
      const body = await readBody(req);
      const sandboxReq: SandboxRequest = {
        method: req.method ?? 'GET',
        path: url.pathname,
        headers: Object.fromEntries(
          Object.entries(req.headers).map(([k, v]) => [
            k,
            Array.isArray(v) ? v.join(', ') : (v ?? '')
          ])
        ),
        body
      };

      try {
        const sandboxRes = await sandboxApp.handleRequest(sandboxReq);
        // Only allow safe response headers from sandbox
        const safeHeaders: Record<string, string> = {};
        const ALLOWED_HEADERS = new Set(['content-type', 'cache-control', 'x-request-id']);
        for (const [key, value] of Object.entries(sandboxRes.headers)) {
          if (ALLOWED_HEADERS.has(key.toLowerCase())) {
            safeHeaders[key] = value;
          }
        }
        res.writeHead(sandboxRes.status, safeHeaders);
        res.end(sandboxRes.body);
      } catch (err) {
        console.error('Sandbox request error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal sandbox error' }));
      }
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  });

  await new Promise<void>((resolve) => {
    server.listen(port, () => resolve());
  });

  const lanIp = getLanIP();

  return {
    port,
    lanUrl: `http://${lanIp}:${String(port)}`,
    localUrl: `http://localhost:${String(port)}`,
    stop: () =>
      new Promise((resolve) => {
        server.close(() => resolve());
      })
  };
}
