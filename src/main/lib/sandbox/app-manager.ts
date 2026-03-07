import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { startAppServer, type AppServer } from './http-server';
import { createSandboxApp } from './quickjs-runtime';
import type { AppInfo, AppManifest, PublishResult, SandboxApp } from './types';

interface RunningApp {
  sandbox: SandboxApp;
  server: AppServer;
  lanUrl: string;
  localUrl: string;
  port: number;
}

class AppManager {
  private runningApps = new Map<string, RunningApp>();
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
      const appJsonPath = join(appsDir, dirName, 'app.json');
      if (!existsSync(appJsonPath)) continue;

      try {
        const meta = JSON.parse(readFileSync(appJsonPath, 'utf-8')) as AppManifest;
        const running = this.runningApps.get(dirName);

        apps.push({
          id: dirName,
          name: meta.name ?? dirName,
          description: meta.description ?? '',
          icon: meta.icon ?? 'app',
          status: running ? 'running' : 'stopped',
          lanUrl: running?.lanUrl ?? null,
          localUrl: running?.localUrl ?? null,
          port: running?.port ?? null
        });
      } catch {
        // Skip invalid app.json
      }
    }
    return apps;
  }

  /** Publish an app: start sandbox + HTTP server */
  async publish(workspaceDir: string, appId: string): Promise<PublishResult> {
    // Prevent concurrent publish for the same app
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
    const indexPath = join(appDir, 'index.html');
    const serverPath = join(appDir, 'server.js');
    const dataPath = join(appDir, 'data.json');

    if (!existsSync(indexPath)) {
      throw new Error(`Missing index.html in app: ${appId}`);
    }
    if (!existsSync(serverPath)) {
      throw new Error(`Missing server.js in app: ${appId}`);
    }

    const frontendHtml = readFileSync(indexPath, 'utf-8');
    const backendJs = readFileSync(serverPath, 'utf-8');

    // Initialize data file if missing
    if (!existsSync(dataPath)) {
      writeFileSync(dataPath, '[]');
    }

    // Read preferred port from manifest
    const manifest = JSON.parse(readFileSync(join(appDir, 'app.json'), 'utf-8')) as AppManifest;
    const preferredPort = manifest.port;

    // Create sandbox first (validates backend code before stopping old app)
    const sandbox = await createSandboxApp(backendJs, appId, dataPath);

    // Start new HTTP server before stopping old one
    const server = await startAppServer(frontendHtml, sandbox, preferredPort);

    // Only stop old app after new one is successfully running
    if (this.runningApps.has(appId)) {
      await this.stop(appId);
    }

    this.runningApps.set(appId, {
      sandbox,
      server,
      lanUrl: server.lanUrl,
      localUrl: server.localUrl,
      port: server.port
    });

    // Persist port to app.json so it stays stable across restarts
    if (server.port !== preferredPort) {
      manifest.port = server.port;
      writeFileSync(join(appDir, 'app.json'), JSON.stringify(manifest, null, 2));
    }

    console.log(`[AppManager] Published "${appId}" at ${server.lanUrl}`);

    return {
      lanUrl: server.lanUrl,
      localUrl: server.localUrl,
      port: server.port
    };
  }

  /** Stop a running app */
  async stop(appId: string): Promise<void> {
    const app = this.runningApps.get(appId);
    if (!app) return;

    await app.server.stop();
    app.sandbox.dispose();
    this.runningApps.delete(appId);

    console.log(`[AppManager] Stopped "${appId}"`);
  }

  /** Stop all running apps (for cleanup on app quit) */
  async disposeAll(): Promise<void> {
    const ids = [...this.runningApps.keys()];
    await Promise.all(ids.map((id) => this.stop(id)));
  }
}

// Singleton
export const appManager = new AppManager();
