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

function getLanIPs(): string[] {
  const nets = networkInterfaces();
  const ips: string[] = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      if (net.family === 'IPv4' && !net.internal) {
        ips.push(net.address);
      }
    }
  }
  return ips;
}

export async function startAppServer(
  frontendHtml: string,
  sandboxApp: SandboxApp,
  preferredPort?: number
): Promise<AppServer> {
  const server = createServer(async (req, res) => {
    const addr = server.address();
    const boundPort = typeof addr === 'object' && addr ? addr.port : 0;
    const url = new URL(req.url ?? '/', `http://localhost:${String(boundPort)}`);

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

    // Serve frontend with CSP to restrict client-side capabilities
    if (url.pathname === '/' || url.pathname === '/index.html') {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy':
          "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; font-src 'self' data:; object-src 'none'; base-uri 'self'"
      });
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

  const listenPort = await new Promise<number>((resolve, reject) => {
    if (preferredPort) {
      // Try preferred port first, fall back to random only on EADDRINUSE
      server.once('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          server.listen(0, () => {
            const addr = server.address();
            resolve(typeof addr === 'object' && addr ? addr.port : 0);
          });
        } else {
          reject(err);
        }
      });
      server.listen(preferredPort, () => resolve(preferredPort));
    } else {
      server.once('error', reject);
      server.listen(0, () => {
        const addr = server.address();
        resolve(typeof addr === 'object' && addr ? addr.port : 0);
      });
    }
  });

  const port = listenPort;
  const lanIps = getLanIPs();
  const primaryIp = lanIps[0] ?? 'localhost';

  return {
    port,
    lanUrl: `http://${primaryIp}:${String(port)}`,
    localUrl: `http://localhost:${String(port)}`,
    stop: () =>
      new Promise((resolve) => {
        server.close(() => resolve());
      })
  };
}
