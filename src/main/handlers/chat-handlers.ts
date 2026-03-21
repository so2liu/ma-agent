import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { join, relative } from 'path';
import { ipcMain, type BrowserWindow } from 'electron';

import { ATTACHMENTS_DIR_NAME, MAX_ATTACHMENT_BYTES } from '../../shared/constants';
import type {
  ChatModelPreference,
  SavedAttachmentInfo,
  SendMessagePayload,
  SerializedAttachmentPayload
} from '../../shared/types/ipc';
import { runtimeEventToIpc } from '../lib/agent-runtime';
import { getApiKey, getOpenAIApiKey, getWorkspaceDir } from '../lib/config';
import { isScheduledTaskExecuting } from '../lib/schedule-state';
import {
  getCurrentModelPreference,
  getPiModelForPreference,
  resolveModel,
  setChatModelPreference
} from '../lib/pi-runtime';
import { sessionManager } from '../lib/session-manager';
import { sanitizeFileName } from './chat-helpers';

const runtimeUnsubscribers = new Map<string, () => void>();

function bindRuntimeEvents(
  chatId: string,
  getMainWindow: () => BrowserWindow | null
): void {
  if (runtimeUnsubscribers.has(chatId)) {
    return;
  }

  const session = sessionManager.get(chatId);
  if (!session) {
    return;
  }

  const unsubscribe = session.runtime.onEvent((event) => {
    const mainWindow = getMainWindow();
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }

    const ipcEvent = runtimeEventToIpc(event, chatId);
    mainWindow.webContents.send(ipcEvent.channel, ...ipcEvent.args);
  });

  runtimeUnsubscribers.set(chatId, unsubscribe);
}

function unbindRuntimeEvents(chatId: string): void {
  runtimeUnsubscribers.get(chatId)?.();
  runtimeUnsubscribers.delete(chatId);
}

function getMissingApiKeyMessage(): string | null {
  const model = resolveModel(getPiModelForPreference(getCurrentModelPreference()));
  if (!model) {
    return '无法解析当前模型配置，请检查设置中的模型 ID。';
  }

  if (model.provider === 'anthropic' || model.api === 'anthropic-messages') {
    return getApiKey() ?
        null
      : 'Anthropic API key is not configured. Add your Anthropic API key in Settings or set ANTHROPIC_API_KEY.';
  }

  return getOpenAIApiKey() ?
      null
    : 'OpenAI API key is not configured. Add your OpenAI API key in Settings or set OPENAI_API_KEY.';
}

export function registerChatHandlers(getMainWindow: () => BrowserWindow | null): void {
  ipcMain.handle('chat:send-message', async (_event, payload: SendMessagePayload) => {
    const normalizedPayload = payload ?? { chatId: '', text: '', attachments: [] };
    const chatId = normalizedPayload.chatId?.trim() ?? '';

    if (!chatId) {
      return { success: false, error: 'Chat ID is required.' };
    }

    const missingApiKeyMessage = getMissingApiKeyMessage();
    if (missingApiKeyMessage) {
      return { success: false, error: missingApiKeyMessage };
    }

    const text = normalizedPayload.text?.trim() ?? '';
    const attachments = normalizedPayload.attachments ?? [];

    if (!text && attachments.length === 0) {
      return { success: false, error: 'Please enter a message or attach a file before sending.' };
    }

    try {
      if (isScheduledTaskExecuting()) {
        return {
          success: false,
          error: '定时任务正在执行中，请稍后再试'
        };
      }

      const savedAttachments = await persistAttachments(attachments);
      const session = sessionManager.getOrCreate(chatId);
      bindRuntimeEvents(chatId, getMainWindow);

      void session.runtime
        .sendMessage({ text, attachments: savedAttachments })
        .catch((error) => {
          console.error(`Failed to send message for chat ${chatId}:`, error);
        });

      return { success: true, attachments: savedAttachments };
    } catch (error) {
      console.error('Error queueing message:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      return { success: false, error: errorMessage };
    }
  });

  ipcMain.handle(
    'chat:reset-session',
    async (_event, chatId: string, resumeSessionId?: string | null) => {
      if (!chatId?.trim()) {
        return { success: false, error: 'Chat ID is required.' };
      }

      try {
        const session = sessionManager.getOrCreate(chatId);
        bindRuntimeEvents(chatId, getMainWindow);
        await session.runtime.reset(resumeSessionId);
        // piSessionId is updated automatically via session-updated event
        // Don't manually set it here — legacy Claude SDK sessionIds would
        // persist as stale values until overwritten by a real session.
        return { success: true };
      } catch (error) {
        console.error('Error resetting session:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        return { success: false, error: errorMessage };
      }
    }
  );

  ipcMain.handle('chat:stop-message', async (_event, chatId: string) => {
    if (!chatId?.trim()) {
      return { success: false, error: 'Chat ID is required.' };
    }

    try {
      const session = sessionManager.get(chatId);
      if (!session) {
        return { success: false, error: 'No active session for this chat.' };
      }

      const wasInterrupted = await session.runtime.interrupt();
      if (!wasInterrupted) {
        return { success: false, error: 'No active response to stop.' };
      }
      return { success: true };
    } catch (error) {
      console.error('Error stopping response:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      return { success: false, error: errorMessage };
    }
  });

  ipcMain.handle('chat:destroy-session', async (_event, chatId: string) => {
    if (!chatId?.trim()) {
      return { success: false, error: 'Chat ID is required.' };
    }

    try {
      unbindRuntimeEvents(chatId);
      await sessionManager.destroy(chatId);
      return { success: true };
    } catch (error) {
      console.error('Error destroying session:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      return { success: false, error: errorMessage };
    }
  });

  ipcMain.handle('chat:get-model-preference', async () => {
    return {
      preference: getCurrentModelPreference()
    };
  });

  ipcMain.handle('chat:set-model-preference', async (_event, preference: ChatModelPreference) => {
    try {
      await setChatModelPreference(preference);
      for (const chatId of sessionManager.listActive()) {
        const session = sessionManager.get(chatId);
        if (session) {
          await session.runtime.setModelPreference(preference);
        }
      }
      return { success: true, preference: getCurrentModelPreference() };
    } catch (error) {
      console.error('Error updating model preference:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      return { success: false, error: errorMessage, preference: getCurrentModelPreference() };
    }
  });
}

async function persistAttachments(
  attachments: SerializedAttachmentPayload[]
): Promise<SavedAttachmentInfo[]> {
  if (attachments.length === 0) {
    return [];
  }

  const workspaceDir = getWorkspaceDir();
  const destinationDir = join(workspaceDir, ATTACHMENTS_DIR_NAME);
  await mkdir(destinationDir, { recursive: true });

  const saves: SavedAttachmentInfo[] = [];

  for (const attachment of attachments) {
    if (attachment.size > MAX_ATTACHMENT_BYTES) {
      throw new Error(
        `Attachment "${attachment.name}" exceeds the ${Math.floor(MAX_ATTACHMENT_BYTES / 1024 / 1024)}MB limit.`
      );
    }

    const sanitized = sanitizeFileName(attachment.name);
    const uniqueName = `${Date.now()}-${randomUUID().slice(0, 8)}-${sanitized}`;
    const savedPath = join(destinationDir, uniqueName);

    const buffer =
      attachment.data instanceof Uint8Array ?
        Buffer.from(attachment.data.buffer, attachment.data.byteOffset, attachment.data.byteLength)
      : Buffer.from(attachment.data);

    await writeFile(savedPath, buffer);

    const relativePath = relative(workspaceDir, savedPath);

    saves.push({
      name: attachment.name,
      mimeType: attachment.mimeType,
      size: attachment.size,
      savedPath,
      relativePath: relativePath.startsWith('..') ? savedPath : relativePath
    });
  }

  return saves;
}
