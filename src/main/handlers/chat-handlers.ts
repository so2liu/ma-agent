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
import {
  applyChatModelPreference,
  getCurrentModelPreference,
  interruptCurrentResponse,
  isSessionActive,
  resetSession,
  setChatModelPreference,
  startStreamingSession
} from '../lib/claude-session';
import { getApiKey, getOpenAIApiKey, getWorkspaceDir } from '../lib/config';
import {
  getPiModelForPreference,
  interruptOpenAIResponse,
  resolveModel,
  resetOpenAISession,
  sendOpenAIMessage
} from '../lib/openai-session';
import { isScheduledTaskExecuting } from '../lib/schedule-state';
import { sessionManager } from '../lib/session-manager';
import { buildPlainTextWithAttachments, buildUserMessage, sanitizeFileName } from './chat-helpers';

export function registerChatHandlers(getMainWindow: () => BrowserWindow | null): void {
  ipcMain.handle('chat:send-message', async (_event, payload: SendMessagePayload) => {
    const normalizedPayload = payload ?? { chatId: '', text: '', attachments: [] };
    const chatId = normalizedPayload.chatId?.trim() ?? '';

    if (!chatId) {
      return { success: false, error: 'Chat ID is required.' };
    }

    const session = sessionManager.getOrCreate(chatId);
    const provider = session.provider;

    if (provider === 'pi') {
      const modelId = getPiModelForPreference(getCurrentModelPreference());
      const model = resolveModel(modelId);
      const apiKey =
        model?.provider === 'anthropic' || model?.api === 'anthropic-messages' ?
          getApiKey()
        : getOpenAIApiKey();
      if (!apiKey) {
        return {
          success: false,
          error:
            model?.provider === 'anthropic' || model?.api === 'anthropic-messages' ?
              'Anthropic API key is not configured. Add your Anthropic API key in Settings or set ANTHROPIC_API_KEY.'
            : 'OpenAI API key is not configured. Add your OpenAI API key in Settings or set OPENAI_API_KEY.'
        };
      }
    } else {
      const apiKey = getApiKey();
      if (!apiKey) {
        return {
          success: false,
          error:
            'API key is not configured. Add your Anthropic API key in Settings or set ANTHROPIC_API_KEY.'
        };
      }
    }

    const text = normalizedPayload.text?.trim() ?? '';
    const attachments = normalizedPayload.attachments ?? [];

    if (!text && attachments.length === 0) {
      return { success: false, error: 'Please enter a message or attach a file before sending.' };
    }

    try {
      // Reject messages while a scheduled task is running -- no interactive
      // session exists to drain the queue, so the message would sit forever.
      if (isScheduledTaskExecuting()) {
        return {
          success: false,
          error: '定时任务正在执行中，请稍后再试'
        };
      }

      const savedAttachments = await persistAttachments(attachments);

      if (provider === 'pi') {
        // Pi path: build plain text with attachment instructions, send directly
        const fullText = buildPlainTextWithAttachments(text, savedAttachments);
        sendOpenAIMessage(
          getMainWindow(),
          chatId,
          fullText,
          getCurrentModelPreference()
        ).catch((error) => {
          console.error('Failed to send Pi message:', error);
        });
        return { success: true, attachments: savedAttachments };
      }

      // Anthropic path: use Claude Agent SDK message queue
      const userMessage = buildUserMessage(text, savedAttachments);

      // Start streaming session if not already running
      if (!isSessionActive(chatId)) {
        startStreamingSession(getMainWindow(), chatId).catch((error) => {
          console.error('Failed to start streaming session:', error);
        });
      }

      // Queue the message
      await new Promise<void>((resolve) => {
        session.messageQueue.push({ message: userMessage, resolve });
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

      const session = sessionManager.getOrCreate(chatId);

      try {
        if (session.provider === 'pi') {
          await resetOpenAISession(chatId);
        } else {
          await resetSession(chatId, resumeSessionId);
        }
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
      const mainWindow = getMainWindow();

      if (session.provider === 'pi') {
        const wasInterrupted = await interruptOpenAIResponse(mainWindow, chatId);
        if (!wasInterrupted) {
          return { success: false, error: 'No active response to stop.' };
        }
        return { success: true };
      }

      const wasInterrupted = await interruptCurrentResponse(mainWindow, chatId);
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
      const session = sessionManager.get(chatId);
      if (session?.provider === 'pi') {
        await resetOpenAISession(chatId);
        await sessionManager.destroy(chatId);
      } else {
        await sessionManager.destroy(chatId);
      }
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
        if (session?.provider === 'claude-sdk') {
          await applyChatModelPreference(chatId, preference);
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
