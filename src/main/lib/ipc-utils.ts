import type { BrowserWindow } from 'electron';

/**
 * Send an IPC event to the renderer, injecting chatId into the payload.
 * Silently no-ops if the window is null or destroyed.
 */
export function sendChatEvent(
  mainWindow: BrowserWindow | null,
  channel: string,
  chatId: string,
  payload: Record<string, unknown> = {}
): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send(channel, { chatId, ...payload });
}
