import type { Query, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';

import type { AgentProvider } from '../../shared/types/ipc';
import { getAgentProvider } from './config';
import { logSessionEvent } from './session-logger';

export interface MessageQueueItem {
  message: SDKUserMessage['message'];
  resolve: () => void;
}

export interface ManagedSession {
  chatId: string;
  provider: AgentProvider;
  querySession: Query | null;
  isProcessing: boolean;
  shouldAbortSession: boolean;
  sessionTerminationPromise: Promise<void> | null;
  resolveTermination: (() => void) | null;
  isInterruptingResponse: boolean;
  sessionGeneration: number;
  pendingResumeSessionId: string | null;
  messageQueue: MessageQueueItem[];
  sessionId: string;
  shouldAbortGenerator: boolean;
  streamIndexToToolId: Map<number, string>;
  lastRateLimitNoticeAt: number;
  rateLimitAttempt: number;
  messageGenerator: () => AsyncGenerator<SDKUserMessage>;
}

function generateSessionId(): string {
  return `session-${Date.now()}`;
}

function createMessageGenerator(session: ManagedSession): () => AsyncGenerator<SDKUserMessage> {
  return async function* messageGenerator(): AsyncGenerator<SDKUserMessage> {
    while (true) {
      if (session.shouldAbortGenerator) {
        return;
      }

      await new Promise<void>((resolve) => {
        const checkQueue = () => {
          if (session.shouldAbortGenerator) {
            resolve();
            return;
          }

          if (session.messageQueue.length > 0) {
            resolve();
            return;
          }

          setTimeout(checkQueue, 100);
        };

        checkQueue();
      });

      if (session.shouldAbortGenerator) {
        return;
      }

      const item = session.messageQueue.shift();
      if (!item) {
        continue;
      }

      const userMessage: SDKUserMessage = {
        type: 'user',
        message: item.message,
        parent_tool_use_id: null,
        session_id: session.sessionId
      };

      logSessionEvent(userMessage);
      yield userMessage;
      item.resolve();
    }
  };
}

function createManagedSession(chatId: string): ManagedSession {
  const session = {
    chatId,
    provider: getAgentProvider(),
    querySession: null,
    isProcessing: false,
    shouldAbortSession: false,
    sessionTerminationPromise: null,
    resolveTermination: null,
    isInterruptingResponse: false,
    sessionGeneration: 0,
    pendingResumeSessionId: null,
    messageQueue: [],
    sessionId: generateSessionId(),
    shouldAbortGenerator: false,
    streamIndexToToolId: new Map<number, string>(),
    lastRateLimitNoticeAt: 0,
    rateLimitAttempt: 0,
    messageGenerator: (() => {
      throw new Error('messageGenerator not initialized');
    }) as ManagedSession['messageGenerator']
  } satisfies Omit<ManagedSession, 'messageGenerator'> & {
    messageGenerator: ManagedSession['messageGenerator'];
  };

  session.messageGenerator = createMessageGenerator(session);
  return session;
}

export class SessionManager {
  private readonly sessions = new Map<string, ManagedSession>();

  getOrCreate(chatId: string): ManagedSession {
    const existing = this.sessions.get(chatId);
    if (existing) {
      return existing;
    }

    const session = createManagedSession(chatId);
    this.sessions.set(chatId, session);
    return session;
  }

  get(chatId: string): ManagedSession | undefined {
    return this.sessions.get(chatId);
  }

  has(chatId: string): boolean {
    return this.sessions.has(chatId);
  }

  async destroy(chatId: string): Promise<void> {
    const session = this.sessions.get(chatId);
    if (!session) {
      return;
    }

    session.sessionGeneration += 1;
    session.shouldAbortSession = true;
    this.abortGenerator(session);
    this.clearMessageQueue(session);

    if (session.querySession) {
      try {
        await session.querySession.interrupt();
      } catch {
        // Ignore interrupt failures during destruction.
      }
    }

    if (session.sessionTerminationPromise) {
      await Promise.race([
        session.sessionTerminationPromise,
        new Promise<void>((resolve) => setTimeout(resolve, 3000))
      ]);
    }

    session.querySession = null;
    session.isProcessing = false;
    session.sessionTerminationPromise = null;
    session.resolveTermination = null;
    this.sessions.delete(chatId);
  }

  isAnyChatActive(): boolean {
    return Array.from(this.sessions.values()).some((session) => this.isChatActive(session));
  }

  listActive(): string[] {
    return Array.from(this.sessions.values())
      .filter((session) => this.isChatActive(session))
      .map((session) => session.chatId);
  }

  clearMessageQueue(session: ManagedSession): void {
    while (session.messageQueue.length > 0) {
      session.messageQueue.shift()?.resolve();
    }
  }

  abortGenerator(session: ManagedSession): void {
    session.shouldAbortGenerator = true;
  }

  resetAbortFlag(session: ManagedSession): void {
    session.shouldAbortGenerator = false;
  }

  setSessionId(session: ManagedSession, nextSessionId?: string | null): void {
    if (nextSessionId && nextSessionId.trim().length > 0) {
      session.sessionId = nextSessionId;
      return;
    }

    session.sessionId = generateSessionId();
  }

  private isChatActive(session: ManagedSession): boolean {
    return session.isProcessing || session.querySession !== null;
  }
}

export const sessionManager = new SessionManager();
