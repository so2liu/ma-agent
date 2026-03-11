import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

// Mock electron before importing message-queue (which imports session-logger → electron)
mock.module('electron', () => ({
  app: {
    getPath: () => '/tmp/test-user-data'
  }
}));

const {
  abortGenerator,
  clearMessageQueue,
  getSessionId,
  messageGenerator,
  messageQueue,
  regenerateSessionId,
  resetAbortFlag,
  setSessionId
} = await import('./message-queue');

describe('message-queue', () => {
  beforeEach(() => {
    clearMessageQueue();
    resetAbortFlag();
  });

  afterEach(() => {
    clearMessageQueue();
    abortGenerator(); // Ensure generators stop
  });

  describe('setSessionId / getSessionId', () => {
    test('generates a default session ID starting with "session-"', () => {
      expect(getSessionId()).toMatch(/^session-\d+$/);
    });

    test('sets a custom session ID', () => {
      setSessionId('my-session-42');
      expect(getSessionId()).toBe('my-session-42');
    });

    test('generates a new ID when called with null', () => {
      setSessionId('custom');
      setSessionId(null);
      expect(getSessionId()).toMatch(/^session-\d+$/);
    });

    test('generates a new ID when called with empty string', () => {
      setSessionId('custom');
      setSessionId('');
      expect(getSessionId()).toMatch(/^session-\d+$/);
    });

    test('generates a new ID when called with whitespace-only string', () => {
      setSessionId('custom');
      setSessionId('   ');
      expect(getSessionId()).toMatch(/^session-\d+$/);
    });
  });

  describe('regenerateSessionId', () => {
    test('delegates to setSessionId with a specific value', () => {
      regenerateSessionId('resumed-session');
      expect(getSessionId()).toBe('resumed-session');
    });

    test('generates a new ID when called with null', () => {
      regenerateSessionId(null);
      expect(getSessionId()).toMatch(/^session-\d+$/);
    });
  });

  describe('clearMessageQueue', () => {
    test('empties the queue', () => {
      messageQueue.push({ message: { role: 'user', content: 'hi' }, resolve: () => {} });
      messageQueue.push({ message: { role: 'user', content: 'bye' }, resolve: () => {} });
      expect(messageQueue.length).toBe(2);

      clearMessageQueue();
      expect(messageQueue.length).toBe(0);
    });

    test('resolves pending promises', () => {
      let resolved = false;
      messageQueue.push({
        message: { role: 'user', content: 'test' },
        resolve: () => {
          resolved = true;
        }
      });

      clearMessageQueue();
      expect(resolved).toBe(true);
    });
  });

  describe('messageGenerator', () => {
    test('yields queued messages with correct session_id', async () => {
      setSessionId('test-session');

      const gen = messageGenerator();

      // Queue a message before consuming
      messageQueue.push({
        message: { role: 'user', content: [{ type: 'text', text: 'hello' }] },
        resolve: () => {}
      });

      const result = await gen.next();
      expect(result.done).toBe(false);
      expect(result.value).toEqual({
        type: 'user',
        message: { role: 'user', content: [{ type: 'text', text: 'hello' }] },
        parent_tool_use_id: null,
        session_id: 'test-session'
      });

      // Abort to stop the generator
      abortGenerator();
      const end = await gen.next();
      expect(end.done).toBe(true);
    });

    test('stops when aborted', async () => {
      const gen = messageGenerator();
      abortGenerator();

      const result = await gen.next();
      expect(result.done).toBe(true);
    });
  });
});
