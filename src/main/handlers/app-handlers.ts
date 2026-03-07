import { ipcMain } from 'electron';

import { getWorkspaceDir } from '../lib/config';
import { appManager } from '../lib/sandbox/app-manager';

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

  ipcMain.handle('app:publish', async (_event, appId: string) => {
    const workspaceDir = getWorkspaceDir();
    try {
      const result = await appManager.publish(workspaceDir, appId);
      return { success: true, ...result };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('app:stop', async (_event, appId: string) => {
    try {
      await appManager.stop(appId);
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });
}
