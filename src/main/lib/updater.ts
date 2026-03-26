import { app, BrowserWindow } from 'electron';
import electronUpdater from 'electron-updater';

import type { UpdateChannel } from './config';
import { getUpdateChannel } from './config';

const { autoUpdater } = electronUpdater;

let mainWindow: BrowserWindow | null = null;
const customFeedUrl = process.env.UPDATE_FEED_URL;
const TOS_BASE_URL = 'https://ma-agent-releases.tos-cn-beijing.volces.com/releases';
const updatesConfigured = Boolean(customFeedUrl) || app.isPackaged;

export interface UpdateInfo {
  version: string;
  releaseDate: string;
  releaseNotes?: string;
}

export interface UpdateStatus {
  checking: boolean;
  updateAvailable: boolean;
  downloading: boolean;
  downloadProgress: number;
  readyToInstall: boolean;
  error: string | null;
  updateInfo: UpdateInfo | null;
  lastCheckComplete: boolean; // True when a manual check just completed
  updateChannel: UpdateChannel;
}

let currentStatus: UpdateStatus = {
  checking: false,
  updateAvailable: false,
  downloading: false,
  downloadProgress: 0,
  readyToInstall: false,
  error: null,
  updateInfo: null,
  lastCheckComplete: false,
  updateChannel: getUpdateChannel()
};

// Configure autoUpdater
autoUpdater.autoDownload = true; // Auto-download in background
autoUpdater.autoInstallOnAppQuit = true; // Auto-install on quit after download

// Sync update channel: set allowPrerelease and update feed URL
function syncAllowPrerelease(): void {
  const channel = getUpdateChannel();
  autoUpdater.allowPrerelease = channel === 'nightly';
  currentStatus = { ...currentStatus, updateChannel: channel };

  // Set feed URL based on channel
  if (customFeedUrl) {
    autoUpdater.setFeedURL({ provider: 'generic', url: customFeedUrl });
  } else if (app.isPackaged) {
    const channelPath = channel === 'nightly' ? 'nightly' : 'release';
    autoUpdater.setFeedURL({
      provider: 'generic',
      url: `${TOS_BASE_URL}/${channelPath}`
    });
  }
}

// Initialize
syncAllowPrerelease();
if (customFeedUrl) {
  console.log('Auto-update feed configured from UPDATE_FEED_URL');
} else if (app.isPackaged) {
  console.log('Auto-update feed configured from Volcengine TOS');
} else {
  console.log('Auto-update feed not configured; skipping feed setup');
}

// Set update check interval (check every 4 hours)
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

let checkInterval: NodeJS.Timeout | null = null;
let pendingTimeouts: NodeJS.Timeout[] = [];
// Incremented on channel switch to discard stale autoUpdater events
let updateGeneration = 0;
let activeGeneration = 0;

function scheduleStatusReset(fn: () => void, ms: number): void {
  const timeout = setTimeout(() => {
    pendingTimeouts = pendingTimeouts.filter((t) => t !== timeout);
    fn();
  }, ms);
  pendingTimeouts.push(timeout);
}

function clearPendingTimeouts(): void {
  for (const t of pendingTimeouts) {
    clearTimeout(t);
  }
  pendingTimeouts = [];
}

export function initializeUpdater(window: BrowserWindow | null): void {
  mainWindow = window;

  // Set up event listeners
  autoUpdater.on('checking-for-update', () => {
    currentStatus = {
      ...currentStatus,
      checking: true,
      error: null
    };
    notifyStatusChange();
  });

  autoUpdater.on('update-available', (info) => {
    if (activeGeneration !== updateGeneration) return;
    let releaseDate: string;
    try {
      const releaseDateValue = info.releaseDate as Date | string | undefined;
      if (releaseDateValue) {
        if (typeof releaseDateValue === 'string') {
          releaseDate = releaseDateValue;
        } else {
          releaseDate = (releaseDateValue as Date).toISOString();
        }
      } else {
        releaseDate = new Date().toISOString();
      }
    } catch {
      releaseDate = new Date().toISOString();
    }

    let releaseNotes: string | undefined;
    try {
      const releaseNotesValue = info.releaseNotes as
        | string
        | Array<{ note?: string } | string>
        | undefined;
      if (releaseNotesValue) {
        if (typeof releaseNotesValue === 'string') {
          releaseNotes = releaseNotesValue;
        } else if (Array.isArray(releaseNotesValue)) {
          releaseNotes = releaseNotesValue
            .map((note) => (typeof note === 'string' ? note : note.note || ''))
            .join('\n');
        }
      }
    } catch {
      // Ignore errors parsing release notes
    }

    currentStatus = {
      ...currentStatus,
      checking: false,
      updateAvailable: true,
      updateInfo: {
        version: info.version,
        releaseDate,
        releaseNotes
      }
    };
    notifyStatusChange();
  });

  autoUpdater.on('update-not-available', () => {
    if (activeGeneration !== updateGeneration) return;
    currentStatus = {
      ...currentStatus,
      checking: false,
      updateAvailable: false,
      updateInfo: null,
      lastCheckComplete: isManualCheck
    };
    notifyStatusChange();
    if (isManualCheck) {
      // Clear the check complete flag after 3 seconds
      scheduleStatusReset(() => {
        currentStatus = {
          ...currentStatus,
          lastCheckComplete: false
        };
        notifyStatusChange();
      }, 3000);
    }
  });

  autoUpdater.on('error', (error) => {
    if (activeGeneration !== updateGeneration) return;
    // Only mark lastCheckComplete if it was a manual check during the check phase
    const wasChecking = currentStatus.checking;
    currentStatus = {
      ...currentStatus,
      checking: false,
      downloading: false,
      lastCheckComplete: isManualCheck && wasChecking,
      error: isManualCheck ? (error.message || 'Unknown error occurred') : null
    };
    notifyStatusChange();
    // Clear error after 5 seconds
    scheduleStatusReset(() => {
      currentStatus = {
        ...currentStatus,
        lastCheckComplete: false,
        error: null
      };
      notifyStatusChange();
    }, 5000);
  });

  autoUpdater.on('download-progress', (progress) => {
    if (activeGeneration !== updateGeneration) return;
    currentStatus = {
      ...currentStatus,
      downloading: true,
      downloadProgress: progress.percent
    };
    notifyStatusChange();
  });

  autoUpdater.on('update-downloaded', () => {
    if (activeGeneration !== updateGeneration) return;
    currentStatus = {
      ...currentStatus,
      downloading: false,
      downloadProgress: 100,
      readyToInstall: true
    };
    notifyStatusChange();
  });
}

function notifyStatusChange(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update:status-changed', currentStatus);
  }
}

// Whether the current check was triggered manually by the user
let isManualCheck = false;

export function checkForUpdates(manual = false): void {
  isManualCheck = manual;
  const isDev = process.env.ELECTRON_RENDERER_URL !== undefined;

  // Sync prerelease setting before checking
  syncAllowPrerelease();

  // Only check in production (not in dev mode)
  if (isDev && !customFeedUrl) {
    console.log('Skipping update check in development mode');
    currentStatus = {
      ...currentStatus,
      checking: false,
      lastCheckComplete: true,
      error: 'Update checks are disabled in development mode'
    };
    notifyStatusChange();
    scheduleStatusReset(() => {
      currentStatus = {
        ...currentStatus,
        lastCheckComplete: false,
        error: null
      };
      notifyStatusChange();
    }, 3000);
    return;
  }

  if (!updatesConfigured) {
    currentStatus = {
      ...currentStatus,
      checking: false,
      downloading: false,
      lastCheckComplete: true,
      error: 'Auto-update feed is not configured'
    };
    notifyStatusChange();
    scheduleStatusReset(() => {
      currentStatus = {
        ...currentStatus,
        lastCheckComplete: false,
        error: null
      };
      notifyStatusChange();
    }, 4000);
    return;
  }

  // Don't check if already checking or downloading
  if (currentStatus.checking || currentStatus.downloading) {
    return;
  }

  // Reset check complete flag
  activeGeneration = updateGeneration;
  currentStatus = {
    ...currentStatus,
    lastCheckComplete: false,
    error: null
  };
  notifyStatusChange();

  autoUpdater.checkForUpdates().catch((error) => {
    console.error('Failed to check for updates:', error);
    currentStatus = {
      ...currentStatus,
      checking: false,
      lastCheckComplete: true,
      error: error.message || 'Failed to check for updates'
    };
    notifyStatusChange();
    // Clear error after 5 seconds
    scheduleStatusReset(() => {
      currentStatus = {
        ...currentStatus,
        lastCheckComplete: false,
        error: null
      };
      notifyStatusChange();
    }, 5000);
  });
}

export function installUpdate(): void {
  if (!currentStatus.readyToInstall) {
    return;
  }

  // isSilent=true: don't show installer UI on macOS
  // isForceRunAfter=true: relaunch app after install
  autoUpdater.quitAndInstall(true, true);
}

export function getUpdateStatus(): UpdateStatus {
  return { ...currentStatus };
}

/**
 * Called when the user changes the update channel.
 * Syncs the allowPrerelease setting and triggers an immediate check.
 */
export function onUpdateChannelChanged(): void {
  // Increment generation to discard stale autoUpdater events from previous channel
  updateGeneration++;
  clearPendingTimeouts();
  syncAllowPrerelease();
  // Reset any existing update state when switching channels
  currentStatus = {
    ...currentStatus,
    checking: false,
    updateAvailable: false,
    readyToInstall: false,
    downloadProgress: 0,
    downloading: false,
    updateInfo: null,
    error: null
  };
  notifyStatusChange();
  // Check for updates immediately with new channel setting
  checkForUpdates();
}

export function startPeriodicUpdateCheck(): void {
  if (!updatesConfigured) {
    return;
  }

  // Check immediately on startup
  checkForUpdates();

  // Then check periodically
  if (checkInterval) {
    clearInterval(checkInterval);
  }

  checkInterval = setInterval(() => {
    checkForUpdates();
  }, CHECK_INTERVAL_MS);
}

export function stopPeriodicUpdateCheck(): void {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
  }
}
