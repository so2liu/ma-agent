import type { ChildProcess } from 'node:child_process';
import { spawn } from 'node:child_process';
import { networkInterfaces } from 'node:os';

export interface ViteDevServer {
  port: number;
  lanUrl: string;
  localUrl: string;
  stop: () => Promise<void>;
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

/** Find an available port by binding to port 0 */
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

/**
 * Start a Vite dev server for an app directory.
 * The Vite config in the app directory handles HMR and API proxy.
 */
export async function startViteDevServer(
  appDir: string,
  sandboxPort: number
): Promise<ViteDevServer> {
  const port = await findAvailablePort();

  // Patch vite.config.ts to use the correct sandbox port for API proxy.
  // Replace both the initial placeholder and any previously written port number.
  const { readFileSync, writeFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const viteConfigPath = join(appDir, 'vite.config.ts');
  const viteConfig = readFileSync(viteConfigPath, 'utf-8');
  const patchedConfig = viteConfig
    .replace(/\{\{SANDBOX_PORT\}\}/g, String(sandboxPort))
    .replace(/target:\s*['"]http:\/\/localhost:\d+['"]/g, `target: 'http://localhost:${String(sandboxPort)}'`);
  writeFileSync(viteConfigPath, patchedConfig);

  return new Promise<ViteDevServer>((resolve, reject) => {
    const child: ChildProcess = spawn(
      'bunx',
      ['vite', '--port', String(port), '--strictPort', '--host'],
      {
        cwd: appDir,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env }
      }
    );

    let resolved = false;
    let stderr = '';
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        reject(new Error(`Vite dev server failed to start within 30s. stderr: ${stderr}`));
        child.kill();
      }
    }, 30_000);

    child.stdout?.on('data', (data: Buffer) => {
      const output = data.toString();
      console.log(`[vite:${String(port)}] ${output.trim()}`);

      // Vite prints "Local: http://localhost:PORT/" when ready
      if (!resolved && /Local:.*http/.test(output)) {
        resolved = true;
        clearTimeout(timeout);
        const lanIps = getLanIPs();
        const primaryIp = lanIps[0] ?? 'localhost';
        resolve({
          port,
          lanUrl: `http://${primaryIp}:${String(port)}`,
          localUrl: `http://localhost:${String(port)}`,
          stop: () => stopChild(child)
        });
      }
    });

    child.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
      console.error(`[vite:${String(port)}:err] ${data.toString().trim()}`);
    });

    child.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        reject(new Error(`Failed to start Vite dev server: ${err.message}`));
      }
    });

    child.on('exit', (code) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        reject(new Error(`Vite dev server exited with code ${String(code)}. stderr: ${stderr}`));
      }
    });
  });
}

function stopChild(child: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    if (child.killed || child.exitCode !== null) {
      resolve();
      return;
    }
    child.on('exit', () => resolve());
    child.kill('SIGTERM');
    // Force kill after 5s
    setTimeout(() => {
      if (!child.killed && child.exitCode === null) {
        child.kill('SIGKILL');
      }
    }, 5000);
  });
}
