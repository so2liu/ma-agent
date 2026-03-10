/**
 * Bun subprocess sandbox — runs a Hono server as a Bun child process
 * and adapts it to the SandboxApp interface so existing http-server
 * and app-manager code works unchanged.
 */
import type { ChildProcess } from 'node:child_process';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import type { SandboxApp, SandboxRequest, SandboxResponse } from './types';

export interface BunSandbox extends SandboxApp {
  port: number;
}

/**
 * Start a Bun subprocess running the Hono server at src/server/index.ts.
 * Returns a SandboxApp that proxies requests via HTTP to the subprocess.
 */
export async function createBunSandbox(appDir: string): Promise<BunSandbox> {
  const serverEntry = join(appDir, 'src', 'server', 'index.ts');
  if (!existsSync(serverEntry)) {
    throw new Error(`Server entry not found: ${serverEntry}`);
  }

  // Find an available port
  const port = await findAvailablePort();

  // Filter sensitive env vars — the subprocess only needs PATH and basic system vars
  const safeEnv: Record<string, string> = {};
  const SENSITIVE_PREFIXES = ['ANTHROPIC_', 'OPENAI_', 'CLAUDE_', 'AWS_', 'POSTHOG_'];
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    if (SENSITIVE_PREFIXES.some((prefix) => key.startsWith(prefix))) continue;
    if (key === 'API_KEY' || key === 'SECRET_KEY') continue;
    safeEnv[key] = value;
  }
  safeEnv.PORT = String(port);

  const child = spawn('bun', ['run', serverEntry], {
    cwd: appDir,
    env: safeEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  // Wait for server to be ready
  await waitForServer(child, port);

  return {
    port,
    handleRequest: async (req: SandboxRequest): Promise<SandboxResponse> => {
      try {
        const url = `http://localhost:${String(port)}${req.path}`;
        const res = await fetch(url, {
          method: req.method,
          headers: req.headers,
          body: req.method !== 'GET' && req.method !== 'HEAD' ? req.body : undefined,
        });
        const body = await res.text();
        const headers: Record<string, string> = {};
        res.headers.forEach((v, k) => {
          headers[k] = v;
        });
        return { status: res.status, headers, body };
      } catch (e) {
        return {
          status: 502,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: `Backend error: ${String(e)}` }),
        };
      }
    },
    dispose: () => {
      if (!child.killed && child.exitCode === null) {
        child.kill('SIGTERM');
        setTimeout(() => {
          if (!child.killed && child.exitCode === null) {
            child.kill('SIGKILL');
          }
        }, 5000);
      }
    },
  };
}

async function findAvailablePort(): Promise<number> {
  const { createServer } = await import('node:net');
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

function waitForServer(child: ChildProcess, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let resolved = false;
    let stderr = '';

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        child.kill();
        reject(new Error(`Bun server failed to start within 15s. stderr: ${stderr}`));
      }
    }, 15_000);

    // Poll for server readiness
    const poll = setInterval(() => {
      fetch(`http://localhost:${String(port)}/api/health`)
        .then((res) => {
          if (res.ok && !resolved) {
            resolved = true;
            clearTimeout(timeout);
            clearInterval(poll);
            resolve();
          }
        })
        .catch(() => {
          // Server not ready yet
        });
    }, 200);

    child.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
      console.error(`[bun:${String(port)}:err] ${data.toString().trim()}`);
    });

    child.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        clearInterval(poll);
        reject(new Error(`Failed to start Bun server: ${err.message}`));
      }
    });

    child.on('exit', (code) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        clearInterval(poll);
        reject(new Error(`Bun server exited with code ${String(code)}. stderr: ${stderr}`));
      }
    });
  });
}
