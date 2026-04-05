import * as Sentry from '@sentry/electron/renderer';

let sentryEnabled = true;
let sentryInitialized = false;

export function initSentryRenderer(): void {
  if (sentryInitialized) {
    return;
  }

  const dsn = window.electron.sentry.getDsn();
  sentryEnabled = window.electron.sentry.getEnabled();

  if (!dsn) {
    return;
  }

  window.electron.sentry.onEnabledChange((enabled) => {
    sentryEnabled = enabled;
  });

  Sentry.init({
    dsn,
    beforeSend(event) {
      if (!sentryEnabled) {
        return null;
      }

      return event;
    }
  });

  sentryInitialized = true;
}
