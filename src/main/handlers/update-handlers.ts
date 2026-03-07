import { ipcMain } from 'electron';

import type { UpdateChannel } from '../lib/config';
import { getUpdateChannel, setUpdateChannel } from '../lib/config';
import {
  checkForUpdates,
  downloadUpdate,
  getUpdateStatus,
  installUpdate,
  onUpdateChannelChanged
} from '../lib/updater';

export function registerUpdateHandlers(): void {
  // Get current update status
  ipcMain.handle('update:get-status', () => {
    return getUpdateStatus();
  });

  // Check for updates manually
  ipcMain.handle('update:check', () => {
    checkForUpdates();
    return { success: true };
  });

  // Download available update
  ipcMain.handle('update:download', () => {
    downloadUpdate();
    return { success: true };
  });

  // Install downloaded update
  ipcMain.handle('update:install', () => {
    installUpdate();
    return { success: true };
  });

  // Get update channel
  ipcMain.handle('update:get-channel', () => {
    return { channel: getUpdateChannel() };
  });

  // Set update channel
  ipcMain.handle('update:set-channel', (_event, channel: UpdateChannel) => {
    setUpdateChannel(channel);
    onUpdateChannelChanged();
    return { success: true, channel: getUpdateChannel() };
  });
}
