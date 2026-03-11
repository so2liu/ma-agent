import { execSync } from 'node:child_process';
import { copyFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { createBunSandbox } from './bun-sandbox';
import { startStaticAppServer, type AppServer } from './http-server';
import type { AppInfo, AppManifest, AppStatus, PublishResult, SandboxApp } from './types';
import { startViteDevServer, type ViteDevServer } from './vite-dev-server';

interface RunningApp {
  sandbox: SandboxApp;
  server: AppServer;
  lanUrl: string;
  localUrl: string;
  port: number;
}

interface DevelopingApp {
  sandbox: SandboxApp;
  viteServer: ViteDevServer;
  lanUrl: string;
  localUrl: string;
  port: number;
}

/** Push Drizzle schema to SQLite database, with backup */
function pushSchema(appDir: string): void {
  const dbPath = join(appDir, 'data.sqlite');
  const backupPath = join(appDir, 'data.sqlite.bak');
  if (existsSync(dbPath)) {
    copyFileSync(dbPath, backupPath);
  }
  try {
    execSync('bun run src/db/push.ts', {
      cwd: appDir,
      stdio: 'pipe',
      timeout: 30_000
    });
  } catch (err) {
    if (existsSync(backupPath)) {
      copyFileSync(backupPath, dbPath);
    }
    throw err;
  }
}

function hasNodeModules(appDir: string): boolean {
  return existsSync(join(appDir, 'node_modules'));
}

function installDeps(appDir: string): void {
  execSync('bun install', {
    cwd: appDir,
    stdio: 'pipe',
    timeout: 120_000
  });
}

function buildApp(appDir: string): void {
  execSync('bunx vite build', {
    cwd: appDir,
    stdio: 'pipe',
    timeout: 120_000
  });
}

class AppManager {
  private runningApps = new Map<string, RunningApp>();
  private developingApps = new Map<string, DevelopingApp>();
  private appStatuses = new Map<string, AppStatus>();
  private publishLocks = new Map<string, Promise<PublishResult>>();

  /** Scan workspace/apps/ directory and return all app info */
  scanApps(workspaceDir: string): AppInfo[] {
    const appsDir = join(workspaceDir, 'apps');
    if (!existsSync(appsDir)) return [];

    let dirs: string[];
    try {
      dirs = readdirSync(appsDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);
    } catch {
      return [];
    }

    const apps: AppInfo[] = [];
    for (const dirName of dirs) {
      const appDir = join(appsDir, dirName);
      const appJsonPath = join(appDir, 'app.json');
      if (!existsSync(appJsonPath)) continue;

      try {
        const meta = JSON.parse(readFileSync(appJsonPath, 'utf-8')) as AppManifest;
        const running = this.runningApps.get(dirName);
        const developing = this.developingApps.get(dirName);
        const transitionalStatus = this.appStatuses.get(dirName);

        let status: AppStatus;
        if (transitionalStatus) {
          status = transitionalStatus;
        } else if (running) {
          status = 'running';
        } else if (developing) {
          status = 'developing';
        } else {
          status = 'stopped';
        }

        apps.push({
          id: dirName,
          name: meta.name ?? dirName,
          description: meta.description ?? '',
          icon: meta.icon ?? 'app',
          status,
          lanUrl: developing?.lanUrl ?? running?.lanUrl ?? null,
          localUrl: developing?.localUrl ?? running?.localUrl ?? null,
          port: developing?.port ?? running?.port ?? null,
          conversationId: meta.conversationId ?? null
        });
      } catch {
        // Skip invalid app.json
      }
    }
    return apps;
  }

  /** Set the conversationId on an app's manifest */
  setConversationId(workspaceDir: string, appId: string, conversationId: string): void {
    const appJsonPath = join(workspaceDir, 'apps', appId, 'app.json');
    if (!existsSync(appJsonPath)) return;
    const meta = JSON.parse(readFileSync(appJsonPath, 'utf-8')) as AppManifest;
    meta.conversationId = conversationId;
    writeFileSync(appJsonPath, JSON.stringify(meta, null, 2));
  }

  /**
   * Start dev mode: install deps, push schema, start Bun + Vite dev server.
   * Vite dev server proxies /api/* to the Bun backend.
   */
  async startDev(workspaceDir: string, appId: string): Promise<PublishResult> {
    await this.stopDev(appId);
    await this.stop(appId);

    const appDir = join(workspaceDir, 'apps', appId);

    if (!existsSync(join(appDir, 'src', 'server', 'index.ts'))) {
      throw new Error(`App "${appId}" is missing src/server/index.ts`);
    }

    try {
      if (!hasNodeModules(appDir)) {
        this.appStatuses.set(appId, 'installing');
        installDeps(appDir);
      }

      pushSchema(appDir);
      const bunSandbox = await createBunSandbox(appDir);

      this.appStatuses.set(appId, 'developing');
      let viteServer: ViteDevServer;
      try {
        viteServer = await startViteDevServer(appDir, bunSandbox.port);
      } catch (err) {
        bunSandbox.dispose();
        throw err;
      }

      this.appStatuses.delete(appId);
      this.developingApps.set(appId, {
        sandbox: bunSandbox,
        viteServer,
        lanUrl: viteServer.lanUrl,
        localUrl: viteServer.localUrl,
        port: viteServer.port
      });

      console.log(`[AppManager] Dev started "${appId}" at ${viteServer.lanUrl}`);

      return {
        lanUrl: viteServer.lanUrl,
        localUrl: viteServer.localUrl,
        port: viteServer.port
      };
    } catch (err) {
      this.appStatuses.delete(appId);
      throw err;
    }
  }

  /** Stop dev mode for an app */
  async stopDev(appId: string): Promise<void> {
    const dev = this.developingApps.get(appId);
    if (!dev) return;

    await dev.viteServer.stop();
    dev.sandbox.dispose();
    this.developingApps.delete(appId);
    this.appStatuses.delete(appId);

    console.log(`[AppManager] Dev stopped "${appId}"`);
  }

  /** Publish an app: build for production + start Bun backend + static server */
  async publish(workspaceDir: string, appId: string): Promise<PublishResult> {
    const existing = this.publishLocks.get(appId);
    if (existing) {
      return existing;
    }
    const promise = this._doPublish(workspaceDir, appId);
    this.publishLocks.set(appId, promise);
    try {
      return await promise;
    } finally {
      this.publishLocks.delete(appId);
    }
  }

  private async _doPublish(workspaceDir: string, appId: string): Promise<PublishResult> {
    const appDir = join(workspaceDir, 'apps', appId);

    if (!existsSync(join(appDir, 'src', 'server', 'index.ts'))) {
      throw new Error(`App "${appId}" is missing src/server/index.ts`);
    }

    await this.stopDev(appId);

    try {
      if (!hasNodeModules(appDir)) {
        this.appStatuses.set(appId, 'installing');
        installDeps(appDir);
      }

      pushSchema(appDir);

      this.appStatuses.set(appId, 'building');
      buildApp(appDir);

      const distDir = join(appDir, 'dist');
      if (!existsSync(distDir)) {
        throw new Error(`Build failed: dist/ directory not found for app "${appId}"`);
      }

      const sandbox = await createBunSandbox(appDir);

      let server: AppServer;
      try {
        server = await startStaticAppServer(distDir, sandbox);
      } catch (err) {
        sandbox.dispose();
        throw err;
      }

      if (this.runningApps.has(appId)) {
        await this.stop(appId);
      }

      this.appStatuses.delete(appId);
      this.runningApps.set(appId, {
        sandbox,
        server,
        lanUrl: server.lanUrl,
        localUrl: server.localUrl,
        port: server.port
      });

      console.log(`[AppManager] Published "${appId}" at ${server.lanUrl}`);

      return {
        lanUrl: server.lanUrl,
        localUrl: server.localUrl,
        port: server.port
      };
    } catch (err) {
      this.appStatuses.delete(appId);
      throw err;
    }
  }

  /** Stop a running (published) app */
  async stop(appId: string): Promise<void> {
    const app = this.runningApps.get(appId);
    if (!app) return;

    await app.server.stop();
    app.sandbox.dispose();
    this.runningApps.delete(appId);

    console.log(`[AppManager] Stopped "${appId}"`);
  }

  /** Stop all running and developing apps (for cleanup on app quit) */
  async disposeAll(): Promise<void> {
    const runningIds = [...this.runningApps.keys()];
    const devIds = [...this.developingApps.keys()];
    await Promise.all([
      ...runningIds.map((id) => this.stop(id)),
      ...devIds.map((id) => this.stopDev(id))
    ]);
  }
}

// Singleton
export const appManager = new AppManager();
