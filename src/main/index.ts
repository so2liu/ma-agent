import { existsSync } from 'fs';
import { join } from 'path';
import { app, BrowserWindow, Menu } from 'electron';

import { registerAnalyticsHandlers } from './handlers/analytics-handlers';
import { registerCanvasHandlers } from './handlers/canvas-handlers';
import { registerAppHandlers } from './handlers/app-handlers';
import { registerChatHandlers } from './handlers/chat-handlers';
import { registerConfigHandlers } from './handlers/config-handlers';
import { registerConversationHandlers } from './handlers/conversation-handlers';
import { registerDbHandlers } from './handlers/db-handlers';
import { registerProjectHandlers } from './handlers/project-handlers';
import { registerScheduleHandlers } from './handlers/schedule-handlers';
import { registerShellHandlers } from './handlers/shell-handlers';
import { registerSkillHandlers } from './handlers/skill-handlers';
import { registerUpdateHandlers } from './handlers/update-handlers';
import { registerWorkspaceHandlers, restartFileWatcher } from './handlers/workspace-handlers';
import { shutdownAnalytics, trackEvent } from './lib/analytics-service';
import { buildEnhancedPath, ensureWorkspaceDir } from './lib/config';
import { appManager } from './lib/sandbox/app-manager';
import { startScheduler, stopScheduler } from './lib/scheduler';
import { skillDiscovery } from './lib/skill-discovery';
import { initializeUpdater, startPeriodicUpdateCheck } from './lib/updater';
import { loadWindowBounds, saveWindowBounds } from './lib/window-state';
import { createApplicationMenu } from './menu';

// Workaround for Electron 39.2.0 crash
// The crash occurs in v8::V8::EnableWebAssemblyTrapHandler during V8 initialization
app.commandLine.appendSwitch('disable-features', 'WebAssemblyTrapHandler');

// Fix PATH for Windows - merge bundled binaries (git, msys2) with user's PATH
process.env.PATH = buildEnhancedPath();

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  // electron-vite uses different extensions in dev (.cjs) vs production (.cjs)
  const isDev = process.env.ELECTRON_RENDERER_URL !== undefined;
  const preloadPath = join(__dirname, '../preload/index.cjs');

  // Load saved window bounds or use defaults
  const savedBounds = loadWindowBounds();
  const defaultBounds = { width: 1200, height: 800 };

  const iconPath = join(__dirname, '../../static/icon.png');
  const icon = existsSync(iconPath) ? iconPath : undefined;

  // titleBarStyle is macOS-only - on Windows/Linux, use default frame
  const windowOptions: Electron.BrowserWindowConstructorOptions = {
    ...defaultBounds,
    ...(savedBounds || {}),
    icon,
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true
    }
  };

  // macOS: hidden title bar + native sidebar vibrancy for translucent effect
  if (process.platform === 'darwin') {
    windowOptions.titleBarStyle = 'hidden';
    windowOptions.vibrancy = 'sidebar';
    windowOptions.backgroundColor = '#00000000';
    windowOptions.show = false;
  }

  mainWindow = new BrowserWindow(windowOptions);

  // Prevent transparent flash on macOS by waiting for renderer to paint
  if (process.platform === 'darwin') {
    mainWindow.once('ready-to-show', () => {
      mainWindow?.show();
    });
  }

  // electron-vite provides ELECTRON_RENDERER_URL in dev mode
  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  // Save window bounds when resized or moved
  const saveBounds = () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      const bounds = mainWindow.getBounds();
      saveWindowBounds(bounds);
    }
  };

  // Debounce the save to avoid excessive writes
  let saveBoundsTimeout: NodeJS.Timeout | null = null;
  const debouncedSaveBounds = () => {
    if (saveBoundsTimeout) {
      clearTimeout(saveBoundsTimeout);
    }
    saveBoundsTimeout = setTimeout(saveBounds, 500);
  };

  mainWindow.on('resize', debouncedSaveBounds);
  mainWindow.on('move', debouncedSaveBounds);

  mainWindow.on('closed', () => {
    // Save bounds one final time when closing
    saveBounds();
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  // Set app display name (overrides productName from package.json)
  app.name = '小马快跑';

  // Set About panel options
  app.setAboutPanelOptions({
    copyright: 'Copyright © 2025 小马快跑'
  });

  // Register all IPC handlers
  registerConfigHandlers();
  registerChatHandlers(() => mainWindow);
  registerConversationHandlers();
  registerProjectHandlers();
  registerShellHandlers();
  registerUpdateHandlers();
  registerWorkspaceHandlers(() => mainWindow);
  registerAppHandlers();
  registerDbHandlers();
  registerSkillHandlers(() => mainWindow);
  registerScheduleHandlers();
  registerAnalyticsHandlers();
  registerCanvasHandlers(() => mainWindow);

  createWindow();

  // Initialize updater after window is created
  initializeUpdater(mainWindow);
  startPeriodicUpdateCheck();

  // Create and set application menu AFTER window is created
  const menu = createApplicationMenu(mainWindow);
  Menu.setApplicationMenu(menu);

  // Track app launch
  trackEvent({ type: 'app_launched', timestamp: Date.now() });

  // Ensure workspace directory exists, then start file watcher, LAN discovery, and scheduler
  ensureWorkspaceDir()
    .then(() => {
      restartFileWatcher();
      skillDiscovery.start().catch((error: unknown) => {
        console.error('Failed to start skill discovery:', error);
      });
      startScheduler();
    })
    .catch((error) => {
      console.error('Failed to ensure workspace directory:', error);
    });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      // Update updater window reference
      initializeUpdater(mainWindow);
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  trackEvent({ type: 'app_closed', timestamp: Date.now() });
  shutdownAnalytics().catch((error) => {
    console.error('Error shutting down analytics:', error);
  });
  stopScheduler();
  skillDiscovery.stop().catch((error) => {
    console.error('Error stopping skill discovery on quit:', error);
  });
  appManager.disposeAll().catch((error) => {
    console.error('Error disposing apps on quit:', error);
  });
});
