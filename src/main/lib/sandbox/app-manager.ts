import { execSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync
} from 'node:fs';
import { basename, join } from 'node:path';

import { startAppServer, startStaticAppServer, type AppServer } from './http-server';
import { createSandboxApp } from './quickjs-runtime';
import { migrateJsonToSqlite } from './sandbox-api';
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
  sandboxServer: AppServer;
  viteServer: ViteDevServer;
  lanUrl: string;
  localUrl: string;
  port: number;
}

/** Resolve the path to the bundled app-template directory */
function getTemplatePath(): string {
  // In development: resources/app-template relative to project root
  // In production: process.resourcesPath + '/app-template'
  const devPath = join(__dirname, '../../resources/app-template');
  if (existsSync(devPath)) return devPath;

  const prodPath = join(process.resourcesPath ?? '', 'app-template');
  if (existsSync(prodPath)) return prodPath;

  throw new Error('App template not found');
}

/** Check if an app uses the React + Vite architecture (has src/App.tsx) */
function isViteApp(appDir: string): boolean {
  return existsSync(join(appDir, 'src', 'App.tsx'));
}

/** Check if an app has been scaffolded (has package.json from template) */
function isScaffolded(appDir: string): boolean {
  return existsSync(join(appDir, 'package.json'));
}

/** Check if dependencies are installed */
function hasNodeModules(appDir: string): boolean {
  return existsSync(join(appDir, 'node_modules'));
}

/** Copy template files into app directory (skip files that already exist) */
function scaffoldApp(appDir: string, manifest: AppManifest): void {
  const templateDir = getTemplatePath();

  const copyRecursive = (srcDir: string, destDir: string): void => {
    if (!existsSync(destDir)) {
      mkdirSync(destDir, { recursive: true });
    }
    const entries = readdirSync(srcDir, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = join(srcDir, entry.name);
      const destPath = join(destDir, entry.name);
      if (entry.isDirectory()) {
        copyRecursive(srcPath, destPath);
      } else if (!existsSync(destPath)) {
        // Only copy if destination doesn't exist (don't overwrite user files)
        copyFileSync(srcPath, destPath);
      }
    }
  };

  copyRecursive(templateDir, appDir);

  // Replace template placeholders in scaffolded files
  const filesToPatch = ['package.json', 'index.html'];
  for (const file of filesToPatch) {
    const filePath = join(appDir, file);
    if (existsSync(filePath)) {
      let content = readFileSync(filePath, 'utf-8');
      content = content.replace(/\{\{APP_ID\}\}/g, basename(appDir));
      content = content.replace(/\{\{APP_NAME\}\}/g, manifest.name);
      writeFileSync(filePath, content);
    }
  }
}

/** Install dependencies using bun */
function installDeps(appDir: string): void {
  execSync('bun install', {
    cwd: appDir,
    stdio: 'pipe',
    timeout: 120_000
  });
}

/** Build the Vite app for production */
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
        const viteApp = isViteApp(appDir);

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
          isViteApp: viteApp
        });
      } catch {
        // Skip invalid app.json
      }
    }
    return apps;
  }

  /**
   * Start dev mode for a Vite app: scaffold, install deps, start sandbox + Vite dev server.
   * The Vite dev server proxies /api/* requests to the sandbox server.
   */
  async startDev(workspaceDir: string, appId: string): Promise<PublishResult> {
    // Stop any existing dev/running instance
    await this.stopDev(appId);
    await this.stop(appId);

    const appDir = join(workspaceDir, 'apps', appId);
    const serverPath = join(appDir, 'server.js');
    const dataPath = join(appDir, 'data.sqlite');

    if (!isViteApp(appDir)) {
      throw new Error(`App "${appId}" is not a Vite app (missing src/App.tsx)`);
    }

    try {
      // Scaffold if needed
      if (!isScaffolded(appDir)) {
        this.appStatuses.set(appId, 'scaffolding');
        const meta = JSON.parse(readFileSync(join(appDir, 'app.json'), 'utf-8')) as AppManifest;
        scaffoldApp(appDir, meta);
      }

      // Install deps if needed
      if (!hasNodeModules(appDir)) {
        this.appStatuses.set(appId, 'installing');
        installDeps(appDir);
      }

      // Migrate from data.json if needed
      migrateJsonToSqlite(join(appDir, 'data.json'), dataPath);

      // Start sandbox for API routes (if server.js exists)
      let sandbox: SandboxApp;
      if (existsSync(serverPath)) {
        const backendJs = readFileSync(serverPath, 'utf-8');
        sandbox = await createSandboxApp(backendJs, appId, dataPath);
      } else {
        // No backend — create a no-op sandbox
        sandbox = {
          handleRequest: async () => ({
            status: 404,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'No server.js backend' })
          }),
          dispose: () => {}
        };
      }

      // Start sandbox HTTP server (for API proxy target)
      const sandboxServer = await startAppServer('', sandbox);

      // Start Vite dev server with proxy to sandbox
      this.appStatuses.set(appId, 'developing');
      let viteServer: ViteDevServer;
      try {
        viteServer = await startViteDevServer(appDir, sandboxServer.port);
      } catch (err) {
        // Clean up sandbox on Vite startup failure
        await sandboxServer.stop();
        sandbox.dispose();
        throw err;
      }

      this.appStatuses.delete(appId);
      this.developingApps.set(appId, {
        sandbox,
        sandboxServer,
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
    await dev.sandboxServer.stop();
    dev.sandbox.dispose();
    this.developingApps.delete(appId);
    this.appStatuses.delete(appId);

    console.log(`[AppManager] Dev stopped "${appId}"`);
  }

  /** Publish an app: build for production + start sandbox + static server */
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
    const serverPath = join(appDir, 'server.js');
    const dataPath = join(appDir, 'data.sqlite');

    const viteApp = isViteApp(appDir);

    if (viteApp) {
      // Stop dev server if running
      await this.stopDev(appId);

      try {
        // Ensure scaffolded and installed
        if (!isScaffolded(appDir)) {
          this.appStatuses.set(appId, 'scaffolding');
          const meta = JSON.parse(
            readFileSync(join(appDir, 'app.json'), 'utf-8')
          ) as AppManifest;
          scaffoldApp(appDir, meta);
        }
        if (!hasNodeModules(appDir)) {
          this.appStatuses.set(appId, 'installing');
          installDeps(appDir);
        }

        // Build for production
        this.appStatuses.set(appId, 'building');
        buildApp(appDir);

        const distDir = join(appDir, 'dist');
        if (!existsSync(distDir)) {
          throw new Error(`Build failed: dist/ directory not found for app "${appId}"`);
        }

        // Migrate from data.json if needed
        migrateJsonToSqlite(join(appDir, 'data.json'), dataPath);

        // Create sandbox for API routes
        let sandbox: SandboxApp;
        if (existsSync(serverPath)) {
          const backendJs = readFileSync(serverPath, 'utf-8');
          sandbox = await createSandboxApp(backendJs, appId, dataPath);
        } else {
          sandbox = {
            handleRequest: async () => ({
              status: 404,
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ error: 'No server.js backend' })
            }),
            dispose: () => {}
          };
        }

        // Start static server serving dist/ with sandbox API
        const server = await startStaticAppServer(distDir, sandbox);

        // Stop old running instance after new one is ready
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

        console.log(`[AppManager] Published Vite app "${appId}" at ${server.lanUrl}`);

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

    // Legacy app path (raw HTML)
    const indexPath = join(appDir, 'index.html');
    if (!existsSync(indexPath)) {
      throw new Error(`Missing index.html in app: ${appId}`);
    }
    if (!existsSync(serverPath)) {
      throw new Error(`Missing server.js in app: ${appId}`);
    }

    const frontendHtml = readFileSync(indexPath, 'utf-8');
    const backendJs = readFileSync(serverPath, 'utf-8');

    // Migrate from data.json if needed
    migrateJsonToSqlite(join(appDir, 'data.json'), dataPath);

    // Read preferred port from manifest
    const manifest = JSON.parse(readFileSync(join(appDir, 'app.json'), 'utf-8')) as AppManifest;
    const preferredPort = manifest.port;

    // Create sandbox first (validates backend code before stopping old app)
    const sandbox = await createSandboxApp(backendJs, appId, dataPath);

    // Stop old app before starting new one so preferred port is available
    if (this.runningApps.has(appId)) {
      await this.stop(appId);
    }

    const server = await startAppServer(frontendHtml, sandbox, preferredPort);

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
