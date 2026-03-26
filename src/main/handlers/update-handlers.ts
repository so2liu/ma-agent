import { ipcMain } from 'electron';

import { getUpdateChannel, setUpdateChannel } from '../lib/config';
import {
  checkForUpdates,
  getUpdateStatus,
  installUpdate,
  onUpdateChannelChanged
} from '../lib/updater';

export function registerUpdateHandlers(): void {
  // Get current update status
  ipcMain.handle('update:get-status', () => {
    return getUpdateStatus();
  });

  // Check for updates manually (user-triggered)
  ipcMain.handle('update:check', () => {
    checkForUpdates(true);
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
  ipcMain.handle('update:set-channel', (_event, channel: unknown) => {
    if (channel !== 'stable' && channel !== 'nightly') {
      return { success: false, error: 'Invalid channel. Must be "stable" or "nightly".' };
    }
    setUpdateChannel(channel);
    onUpdateChannelChanged();
    return { success: true, channel: getUpdateChannel() };
  });
}
