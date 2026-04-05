import { ipcMain } from 'electron';

import type {
  AnalyticsEvent,
  AnalyticsSettings,
  MessageFeedback
} from '../../shared/types/analytics';
import {
  getAnalyticsSettings,
  setAnalyticsSettings,
  submitFeedback,
  trackEvent
} from '../lib/analytics-service';
import { setSentryEnabled } from '../lib/sentry';

export function registerAnalyticsHandlers(): void {
  ipcMain.handle('analytics:track-event', (_event, analyticsEvent: AnalyticsEvent) => {
    trackEvent(analyticsEvent);
  });

  ipcMain.handle('analytics:submit-feedback', (_event, feedback: MessageFeedback) => {
    submitFeedback(feedback);
  });

  ipcMain.handle('analytics:get-settings', () => {
    return getAnalyticsSettings();
  });

  ipcMain.handle('analytics:set-settings', (_event, settings: Partial<AnalyticsSettings>) => {
    const nextSettings = setAnalyticsSettings(settings);
    setSentryEnabled(nextSettings.enabled);
    return nextSettings;
  });
}
