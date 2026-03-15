import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

mock.module('electron', () => ({
  app: {
    getPath: () => '/tmp/test-user-data'
  }
}));

const { sessionManager } = await import('./session-manager');

describe('session-manager', () => {
  const chatId = 'chat-test';

  beforeEach(async () => {
    await sessionManager.destroy(chatId);
  });

  afterEach(async () => {
    await sessionManager.destroy(chatId);
  });

  test('creates and reuses a managed session per chatId', () => {
    const first = sessionManager.getOrCreate(chatId);
    const second = sessionManager.getOrCreate(chatId);

    expect(first).toBe(second);
    expect(first.chatId).toBe(chatId);
    expect(first.sessionId).toMatch(/^session-\d+$/);
  });

  test('setSessionId updates session IDs', () => {
    const session = sessionManager.getOrCreate(chatId);

    sessionManager.setSessionId(session, 'custom-session');
    expect(session.sessionId).toBe('custom-session');

    sessionManager.setSessionId(session, null);
    expect(session.sessionId).toMatch(/^session-\d+$/);
  });

  test('clearMessageQueue empties the queue and resolves pending entries', () => {
    const session = sessionManager.getOrCreate(chatId);
    let resolved = false;

    session.messageQueue.push({
      message: { role: 'user', content: 'test' },
      resolve: () => {
        resolved = true;
      }
    });

    sessionManager.clearMessageQueue(session);

    expect(session.messageQueue).toHaveLength(0);
    expect(resolved).toBe(true);
  });

  test('messageGenerator yields queued messages with the session sessionId', async () => {
    const session = sessionManager.getOrCreate(chatId);
    sessionManager.setSessionId(session, 'session-42');

    const generator = session.messageGenerator();
    session.messageQueue.push({
      message: { role: 'user', content: [{ type: 'text', text: 'hello' }] },
      resolve: () => {}
    });

    const result = await generator.next();

    expect(result.done).toBe(false);
    expect(result.value).toEqual({
      type: 'user',
      message: { role: 'user', content: [{ type: 'text', text: 'hello' }] },
      parent_tool_use_id: null,
      session_id: 'session-42'
    });

    sessionManager.abortGenerator(session);
    const end = await generator.next();
    expect(end.done).toBe(true);
  });
});
