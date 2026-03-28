import { ipcMain } from 'electron';

import { getFeishuConfig, getFeishuEnabled, setFeishuConfig } from '../lib/config';
import { feishuBot } from '../lib/feishu/feishu-bot';
import type { FeishuConfig, FeishuConnectionStatus } from '../lib/feishu/types';

function getFeishuStatus(): FeishuConnectionStatus {
  return feishuBot.isRunning() ? 'connected' : 'disconnected';
}

async function restartFeishuBot(config: FeishuConfig): Promise<void> {
  if (feishuBot.isRunning()) {
    feishuBot.stop();
  }

  await feishuBot.start(config);
}

export function registerFeishuHandlers(): void {
  ipcMain.handle('feishu:get-config', () => {
    return getFeishuConfig();
  });

  ipcMain.handle('feishu:set-config', async (_event, config: FeishuConfig) => {
    setFeishuConfig(config);

    const savedConfig = getFeishuConfig();
    if (!savedConfig || !savedConfig.enabled) {
      feishuBot.stop();
      return;
    }

    await restartFeishuBot(savedConfig);
  });

  ipcMain.handle('feishu:get-status', () => {
    return getFeishuStatus();
  });

  ipcMain.handle('feishu:start', async () => {
    const config = getFeishuConfig();
    if (!config) {
      throw new Error('Feishu bot config is incomplete.');
    }

    await restartFeishuBot(config);
  });

  ipcMain.handle('feishu:stop', () => {
    feishuBot.stop();
  });
}

export async function startFeishuBotIfEnabled(): Promise<void> {
  if (!getFeishuEnabled()) {
    return;
  }

  const config = getFeishuConfig();
  if (!config) {
    console.warn('Feishu bot is enabled but config is incomplete.');
    return;
  }

  try {
    await restartFeishuBot(config);
  } catch (error) {
    console.error('Failed to start Feishu bot:', error);
  }
}
