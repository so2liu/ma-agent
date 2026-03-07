import { ipcMain } from 'electron';

import { getWorkspaceDir } from '../lib/config';
import { appManager } from '../lib/sandbox/app-manager';

/** Validate appId to prevent path traversal attacks */
function validateAppId(appId: unknown): string {
  if (typeof appId !== 'string' || appId.length === 0) {
    throw new Error('appId must be a non-empty string');
  }
  if (/[/\\]|\.\./.test(appId)) {
    throw new Error('appId contains invalid characters');
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(appId)) {
    throw new Error('appId must only contain alphanumeric characters, hyphens, and underscores');
  }
  return appId;
}

export function registerAppHandlers(): void {
  ipcMain.handle('app:scan', () => {
    const workspaceDir = getWorkspaceDir();
    try {
      const apps = appManager.scanApps(workspaceDir);
      return { success: true, apps };
    } catch (error) {
      return { success: false, apps: [], error: String(error) };
    }
  });

  ipcMain.handle('app:publish', async (_event, appId: unknown) => {
    try {
      const id = validateAppId(appId);
      const workspaceDir = getWorkspaceDir();
      const result = await appManager.publish(workspaceDir, id);
      return { success: true, ...result };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('app:stop', async (_event, appId: unknown) => {
    try {
      const id = validateAppId(appId);
      await appManager.stop(id);
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });
}
