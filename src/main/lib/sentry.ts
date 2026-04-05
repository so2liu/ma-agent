import * as Sentry from '@sentry/electron/main';
import { app, BrowserWindow, ipcMain } from 'electron';

import { getAnalyticsSettings } from './analytics-service';

const SENTRY_DSN = process.env.SENTRY_DSN ?? __SENTRY_DSN__;
const isDev = !!process.env.ELECTRON_RENDERER_URL;
const SENTRY_ENABLED_CHANGED_CHANNEL = 'sentry:enabled-changed';

let sentryInitialized = false;
let sentryIpcRegistered = false;
let sentryEnabled = true;

function registerSentryIpcHandlers(): void {
  if (sentryIpcRegistered) {
    return;
  }

  ipcMain.on('sentry:get-dsn', (event) => {
    event.returnValue = getSentryDsn();
  });

  ipcMain.on('sentry:get-enabled', (event) => {
    event.returnValue = getSentryEnabled();
  });

  sentryIpcRegistered = true;
}

export function initSentry(): void {
  registerSentryIpcHandlers();
  sentryEnabled = getAnalyticsSettings().enabled;

  if (sentryInitialized || !SENTRY_DSN) {
    return;
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    release: app.getVersion(),
    environment: isDev ? 'development' : 'production',
    beforeSend(event) {
      if (!sentryEnabled) {
        return null;
      }

      return event;
    }
  });

  sentryInitialized = true;
}

export function getSentryDsn(): string {
  return SENTRY_DSN;
}

export function getSentryEnabled(): boolean {
  return sentryEnabled;
}

export function setSentryEnabled(enabled: boolean): void {
  sentryEnabled = enabled;

  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(SENTRY_ENABLED_CHANGED_CHANNEL, enabled);
    }
  }
}

export async function flushSentry(): Promise<void> {
  if (!sentryInitialized) {
    return;
  }

  await Sentry.close(2000);
  sentryInitialized = false;
}
