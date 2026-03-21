import type { AgentRuntime } from './agent-runtime';
import { PiRuntime } from './pi-runtime';

export interface ManagedSession {
  chatId: string;
  runtime: AgentRuntime;
  piSessionId: string | null;
}

function createManagedSession(chatId: string): ManagedSession {
  const runtime = new PiRuntime();
  const session: ManagedSession = {
    chatId,
    runtime,
    piSessionId: null
  };

  runtime.onEvent((event) => {
    if (event.type === 'session-updated') {
      session.piSessionId = event.sessionId;
    }
  });

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

    await session.runtime.reset();
    this.sessions.delete(chatId);
  }

  isAnyChatActive(): boolean {
    return Array.from(this.sessions.values()).some((session) => session.runtime.isActive());
  }

  listActive(): string[] {
    return Array.from(this.sessions.values())
      .filter((session) => session.runtime.isActive())
      .map((session) => session.chatId);
  }
}

export const sessionManager = new SessionManager();
