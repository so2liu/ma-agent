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
    expect(first.piSessionId).toBeNull();
    expect(typeof first.runtime.sendMessage).toBe('function');
  });

  test('stores pi session id from runtime session-updated events', async () => {
    const session = sessionManager.getOrCreate(chatId);

    session.piSessionId = null;
    session.piSessionId = 'pi-session-42';
    expect(session.piSessionId).toBe('pi-session-42');
  });

  test('destroy removes managed sessions', async () => {
    sessionManager.getOrCreate(chatId);
    expect(sessionManager.has(chatId)).toBe(true);

    await sessionManager.destroy(chatId);
    expect(sessionManager.has(chatId)).toBe(false);
  });
});
