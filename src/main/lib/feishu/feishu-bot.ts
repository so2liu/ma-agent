import * as lark from '@larksuiteoapi/node-sdk';

import type { SavedAttachmentInfo } from '../../../shared/types/ipc';
import type { RuntimeMessage } from '../agent-runtime';
import {
  createConversation,
  getConversation,
  type Conversation,
  updateConversation
} from '../conversation-db';
import {
  getApiKey,
  getFeishuConfig,
  getOpenAIApiKey,
  getWorkspaceDir,
  setFeishuConfig
} from '../config';
import {
  getCurrentModelPreference,
  getPiModelForPreference,
  resolveModel
} from '../pi-runtime';
import { sessionManager, type ManagedSession } from '../session-manager';
import { FeishuReplier } from './feishu-reply';
import { convertFeishuMessage } from './message-converter';
import type { FeishuConfig, FeishuMessageEvent } from './types';

type QueuedMessage = {
  event: FeishuMessageEvent;
};

type PendingReply = {
  feishuMessageId: string;
  feishuChatId: string;
  chunks: string[];
  unsubscribe: () => void;
};

type PersistedConversationMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  attachments?: SavedAttachmentInfo[];
};

const MAX_PROCESSED_MESSAGE_IDS = 1000;
const FEISHU_CONVERSATION_TITLE = '飞书机器人';
const STOPPED_REPLY_TEXT = '（已中断）';
const AUDIO_UNSUPPORTED_TEXT = '暂不支持语音消息，请发送文字';

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

function isAppMessage(event: FeishuMessageEvent): boolean {
  return event.sender.sender_type.toLowerCase() === 'app';
}

function isGroupMessage(event: FeishuMessageEvent): boolean {
  return event.message.chat_type !== 'p2p';
}

function normalizeMentionName(name: string): string {
  return name.trim().toLowerCase();
}

function isBotMentioned(event: FeishuMessageEvent, mentionNames: Set<string>): boolean {
  if (mentionNames.size === 0) {
    return false;
  }

  const mentions = event.message.mentions ?? [];
  return mentions.some((mention) => mentionNames.has(normalizeMentionName(mention.name)));
}

function normalizeError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  if (typeof error === 'string' && error.trim()) {
    return error.trim();
  }

  return 'Unknown error occurred';
}

function toIsoTimestamp(value?: string): string {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    const millis = numeric > 1e12 ? numeric : numeric * 1000;
    return new Date(millis).toISOString();
  }

  return new Date().toISOString();
}

function parseConversationMessages(conversation: Conversation): PersistedConversationMessage[] {
  try {
    const parsed = JSON.parse(conversation.messages) as unknown;
    return Array.isArray(parsed) ? (parsed as PersistedConversationMessage[]) : [];
  } catch {
    return [];
  }
}

function buildUserMessage(
  event: FeishuMessageEvent,
  message: RuntimeMessage
): PersistedConversationMessage {
  return {
    id: `feishu-user-${event.message.message_id}`,
    role: 'user',
    content: message.text,
    timestamp: toIsoTimestamp(event.message.create_time),
    ...(message.attachments?.length ? { attachments: message.attachments } : {})
  };
}

function buildAssistantMessage(
  sourceMessageId: string,
  text: string
): PersistedConversationMessage {
  return {
    id: `feishu-assistant-${sourceMessageId}-${Date.now()}`,
    role: 'assistant',
    content: text,
    timestamp: new Date().toISOString()
  };
}

export class FeishuBot {
  static readonly CHAT_ID = 'feishu-bot';

  private wsClient: lark.WSClient | null = null;
  private client: lark.Client | null = null;
  private replier: FeishuReplier | null = null;
  private running = false;
  private processedMessageIds = new Set<string>();
  private messageQueue: QueuedMessage[] = [];
  private pendingReply: PendingReply | null = null;
  private currentConfig: FeishuConfig | null = null;
  private conversationId: string | null = null;
  private conversation: Conversation | null = null;
  private sessionInitialized = false;
  private botMentionNames = new Set<string>();

  async start(config: FeishuConfig): Promise<void> {
    if (this.running) {
      return;
    }

    const normalizedConfig: FeishuConfig = {
      enabled: config.enabled,
      appId: config.appId.trim(),
      appSecret: config.appSecret.trim(),
      conversationId: config.conversationId?.trim() || undefined
    };

    if (!normalizedConfig.appId || !normalizedConfig.appSecret) {
      throw new Error('Feishu bot config is incomplete.');
    }

    const client = new lark.Client({
      appId: normalizedConfig.appId,
      appSecret: normalizedConfig.appSecret
    });

    const wsClient = new lark.WSClient({
      appId: normalizedConfig.appId,
      appSecret: normalizedConfig.appSecret
    });

    try {
      this.client = client;
      this.replier = new FeishuReplier(client);
      this.currentConfig = normalizedConfig;
      this.botMentionNames = await this.fetchBotMentionNames(client, normalizedConfig.appId);

      await this.ensureConversation(normalizedConfig);
      await this.ensureSessionPrepared();

      const eventDispatcher = new lark.EventDispatcher({}).register({
        'im.message.receive_v1': async (event) => {
          await this.handleIncomingMessage(event);
        }
      });

      await wsClient.start({ eventDispatcher });
      this.wsClient = wsClient;
      this.running = true;
    } catch (error) {
      this.wsClient?.close();
      this.wsClient = null;
      this.client = null;
      this.replier = null;
      this.currentConfig = null;
      this.conversation = null;
      this.conversationId = null;
      this.sessionInitialized = false;
      this.botMentionNames.clear();
      throw error;
    }
  }

  stop(): void {
    if (!this.running && !this.wsClient) {
      return;
    }

    const pendingReply = this.pendingReply;
    const replier = this.replier;
    this.pendingReply = null;
    this.messageQueue = [];
    this.running = false;
    this.wsClient?.close();
    this.wsClient = null;
    this.client = null;
    this.replier = null;
    this.currentConfig = null;
    this.conversation = null;
    this.conversationId = null;
    this.sessionInitialized = false;
    this.botMentionNames.clear();

    if (pendingReply) {
      pendingReply.unsubscribe();
      void replier?.removeTypingReaction(pendingReply.feishuMessageId);
    }
  }

  isRunning(): boolean {
    return this.running;
  }

  private async handleIncomingMessage(event: FeishuMessageEvent): Promise<void> {
    const messageId = event.message.message_id;
    if (!messageId) {
      return;
    }

    if (isAppMessage(event)) {
      return;
    }

    if (isGroupMessage(event) && !isBotMentioned(event, this.botMentionNames)) {
      return;
    }

    if (this.processedMessageIds.has(messageId)) {
      return;
    }
    this.markProcessed(messageId);

    const replier = this.replier;
    if (!replier) {
      return;
    }

    const missingApiKeyMessage = getMissingApiKeyMessage();
    if (missingApiKeyMessage) {
      await replier.reply(messageId, event.message.chat_id, missingApiKeyMessage);
      return;
    }

    this.messageQueue.push({ event });
    void this.drainQueue();
  }

  private markProcessed(messageId: string): void {
    this.processedMessageIds.add(messageId);

    if (this.processedMessageIds.size <= MAX_PROCESSED_MESSAGE_IDS) {
      return;
    }

    const oldest = this.processedMessageIds.values().next().value;
    if (typeof oldest === 'string') {
      this.processedMessageIds.delete(oldest);
    }
  }

  private async drainQueue(): Promise<void> {
    if (this.pendingReply) {
      return;
    }

    const next = this.messageQueue.shift();
    if (!next) {
      return;
    }

    await this.processQueuedMessage(next);
  }

  private async processQueuedMessage(queuedMessage: QueuedMessage): Promise<void> {
    const client = this.client;
    const replier = this.replier;
    if (!client || !replier) {
      return;
    }

    await this.ensureConversation(this.currentConfig ?? getFeishuConfig());
    await this.ensureSessionPrepared();

    const session = sessionManager.getOrCreate(FeishuBot.CHAT_ID);
    const { event } = queuedMessage;
    const messageId = event.message.message_id;
    const chatId = event.message.chat_id;
    const pendingReply: PendingReply = {
      feishuMessageId: messageId,
      feishuChatId: chatId,
      chunks: [],
      unsubscribe: () => {}
    };

    this.pendingReply = pendingReply;

    try {
      const runtimeMessage = await convertFeishuMessage(event, client, getWorkspaceDir());
      if (this.pendingReply !== pendingReply || !this.running) {
        return;
      }

      if (!runtimeMessage.text.trim() && !runtimeMessage.attachments?.length) {
        this.finishPendingReply(pendingReply);
        return;
      }

      if (event.message.message_type === 'audio') {
        await replier.reply(messageId, chatId, AUDIO_UNSUPPORTED_TEXT);
        this.finishPendingReply(pendingReply);
        return;
      }

      await this.appendConversationMessage(buildUserMessage(event, runtimeMessage));
      if (this.pendingReply !== pendingReply || !this.running) {
        return;
      }

      await replier.addTypingReaction(messageId);

      let settled = false;
      const finalizeComplete = (text: string) => {
        if (settled) {
          return;
        }
        settled = true;
        pendingReply.unsubscribe();
        void this.handleReplyComplete(pendingReply, text);
      };
      const finalizeError = (error: string) => {
        if (settled) {
          return;
        }
        settled = true;
        pendingReply.unsubscribe();
        void this.handleReplyError(pendingReply, error);
      };

      pendingReply.unsubscribe = session.runtime.onEvent((runtimeEvent) => {
        if (this.pendingReply !== pendingReply) {
          return;
        }

        switch (runtimeEvent.type) {
          case 'message-chunk':
            pendingReply.chunks.push(runtimeEvent.text);
            break;
          case 'message-complete':
            finalizeComplete(pendingReply.chunks.join(''));
            break;
          case 'message-stopped':
            finalizeComplete(pendingReply.chunks.join('') || STOPPED_REPLY_TEXT);
            break;
          case 'message-error':
            finalizeError(runtimeEvent.error);
            break;
          default:
            break;
        }
      });

      await session.runtime.sendMessage(runtimeMessage);

      if (this.pendingReply === pendingReply && !settled) {
        finalizeComplete(pendingReply.chunks.join(''));
      }
    } catch (error) {
      if (this.pendingReply === pendingReply) {
        await this.handleReplyError(pendingReply, normalizeError(error));
      }
    }
  }

  private async handleReplyComplete(pendingReply: PendingReply, text: string): Promise<void> {
    const replier = this.replier;
    if (!replier) {
      this.finishPendingReply(pendingReply);
      return;
    }

    try {
      await replier.removeTypingReaction(pendingReply.feishuMessageId);
      await replier.reply(pendingReply.feishuMessageId, pendingReply.feishuChatId, text);
      await this.appendConversationMessage(
        buildAssistantMessage(pendingReply.feishuMessageId, text.trim() || STOPPED_REPLY_TEXT)
      );
    } finally {
      this.finishPendingReply(pendingReply);
    }
  }

  private async handleReplyError(pendingReply: PendingReply, error: string): Promise<void> {
    const replier = this.replier;
    const normalizedError = error.trim() || 'Unknown error occurred';

    try {
      await replier?.removeTypingReaction(pendingReply.feishuMessageId);
      if (replier) {
        await replier.reply(
          pendingReply.feishuMessageId,
          pendingReply.feishuChatId,
          normalizedError
        );
      }
      await this.appendConversationMessage(
        buildAssistantMessage(pendingReply.feishuMessageId, normalizedError)
      );
    } finally {
      this.finishPendingReply(pendingReply);
    }
  }

  private finishPendingReply(pendingReply: PendingReply): void {
    if (this.pendingReply !== pendingReply) {
      return;
    }

    this.pendingReply = null;
    void this.drainQueue();
  }

  private async ensureConversation(config: FeishuConfig | null): Promise<void> {
    if (!config) {
      throw new Error('Feishu bot config is unavailable.');
    }

    if (this.conversationId) {
      const persistedConversation = getConversation(this.conversationId);
      if (persistedConversation) {
        this.conversation = persistedConversation;
        return;
      }
    }

    if (this.conversation && this.conversationId === this.conversation.id) {
      return;
    }

    const existingConversationId = config.conversationId?.trim();
    const existingConversation =
      existingConversationId ? getConversation(existingConversationId) : null;

    if (existingConversation) {
      this.conversationId = existingConversation.id;
      this.conversation = existingConversation;
      this.currentConfig = {
        ...config,
        conversationId: existingConversation.id
      };
      return;
    }

    const createdConversation = createConversation(FEISHU_CONVERSATION_TITLE, [], undefined, {
      isFeishu: true
    });
    this.conversationId = createdConversation.id;
    this.conversation = createdConversation;
    this.currentConfig = {
      ...config,
      conversationId: createdConversation.id
    };
    setFeishuConfig(this.currentConfig);
  }

  private async ensureSessionPrepared(): Promise<ManagedSession> {
    const session = sessionManager.getOrCreate(FeishuBot.CHAT_ID);
    if (this.sessionInitialized) {
      return session;
    }

    await session.runtime.reset(this.conversation?.sessionId ?? null);
    this.sessionInitialized = true;
    return session;
  }

  private async appendConversationMessage(message: PersistedConversationMessage): Promise<void> {
    const conversation = this.conversation;
    if (!conversation) {
      return;
    }

    const session = sessionManager.getOrCreate(FeishuBot.CHAT_ID);
    const messages = parseConversationMessages(conversation);
    messages.push(message);

    updateConversation(
      conversation.id,
      FEISHU_CONVERSATION_TITLE,
      messages,
      session.piSessionId ?? conversation.sessionId ?? undefined
    );

    this.conversation = getConversation(conversation.id);
  }

  private async fetchBotMentionNames(client: lark.Client, appId: string): Promise<Set<string>> {
    const names = new Set<string>();

    try {
      const response = await client.application.v6.application.get({
        path: { app_id: appId },
        params: { lang: 'zh_cn' }
      });
      const app = response.data?.app;
      if (app?.app_name) {
        names.add(normalizeMentionName(app.app_name));
      }

      for (const item of app?.i18n ?? []) {
        if (item.name) {
          names.add(normalizeMentionName(item.name));
        }
      }
    } catch (error) {
      console.warn('Failed to load Feishu app metadata for mention matching:', error);
    }

    return names;
  }
}

export const feishuBot = new FeishuBot();
