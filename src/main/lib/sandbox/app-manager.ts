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
          icon: meta.icon ?? '📱',
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
    // Stop if already running
    if (this.runningApps.has(appId)) {
      await this.stop(appId);
    }

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

    // Create sandbox
    const sandbox = await createSandboxApp(backendJs, appId, dataPath);

    // Start HTTP server
    const server = await startAppServer(frontendHtml, sandbox);

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
