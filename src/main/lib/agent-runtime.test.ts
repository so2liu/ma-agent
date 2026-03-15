import { describe, expect, test } from 'bun:test';

import { runtimeEventToIpc, type RuntimeEvent } from './agent-runtime';

describe('runtimeEventToIpc', () => {
  const chatId = 'chat-1';

  test('maps message-chunk to correct IPC channel', () => {
    const result = runtimeEventToIpc({ type: 'message-chunk', text: 'hello' }, chatId);
    expect(result).toEqual({
      channel: 'chat:message-chunk',
      args: [{ chatId, chunk: 'hello' }]
    });
  });

  test('maps thinking-start', () => {
    const result = runtimeEventToIpc({ type: 'thinking-start', index: 0 }, chatId);
    expect(result).toEqual({
      channel: 'chat:thinking-start',
      args: [{ chatId, index: 0 }]
    });
  });

  test('maps tool-use-start with all fields', () => {
    const event: RuntimeEvent = {
      type: 'tool-use-start',
      id: 't1',
      name: 'Bash',
      input: { command: 'ls' },
      streamIndex: 2
    };
    const result = runtimeEventToIpc(event, chatId);
    expect(result.channel).toBe('chat:tool-use-start');
    expect(result.args[0]).toEqual({
      chatId,
      id: 't1',
      name: 'Bash',
      input: { command: 'ls' },
      streamIndex: 2
    });
  });

  test('maps message-complete with empty args', () => {
    const result = runtimeEventToIpc({ type: 'message-complete' }, chatId);
    expect(result).toEqual({ channel: 'chat:message-complete', args: [{ chatId }] });
  });

  test('maps message-error', () => {
    const result = runtimeEventToIpc({ type: 'message-error', error: 'rate limit' }, chatId);
    expect(result).toEqual({
      channel: 'chat:message-error',
      args: [{ chatId, error: 'rate limit' }]
    });
  });

  test('maps tool-result-complete', () => {
    const result = runtimeEventToIpc(
      {
        type: 'tool-result-complete',
        toolUseId: 't1',
        content: 'output',
        isError: false
      },
      chatId
    );
    expect(result.channel).toBe('chat:tool-result-complete');
    expect(result.args[0]).toEqual({
      chatId,
      toolUseId: 't1',
      content: 'output',
      isError: false
    });
  });

  test('maps session-updated', () => {
    const result = runtimeEventToIpc(
      {
        type: 'session-updated',
        sessionId: 'sess-1',
        resumed: true
      },
      chatId
    );
    expect(result.channel).toBe('chat:session-updated');
    expect(result.args[0]).toEqual({ chatId, sessionId: 'sess-1', resumed: true });
  });
});
