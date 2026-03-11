import { describe, expect, test } from 'bun:test';

import { runtimeEventToIpc, type RuntimeEvent } from './agent-runtime';

describe('runtimeEventToIpc', () => {
  test('maps message-chunk to correct IPC channel', () => {
    const result = runtimeEventToIpc({ type: 'message-chunk', text: 'hello' });
    expect(result).toEqual({ channel: 'chat:message-chunk', args: ['hello'] });
  });

  test('maps thinking-start', () => {
    const result = runtimeEventToIpc({ type: 'thinking-start', index: 0 });
    expect(result).toEqual({ channel: 'chat:thinking-start', args: [{ index: 0 }] });
  });

  test('maps tool-use-start with all fields', () => {
    const event: RuntimeEvent = {
      type: 'tool-use-start',
      id: 't1',
      name: 'Bash',
      input: { command: 'ls' },
      streamIndex: 2
    };
    const result = runtimeEventToIpc(event);
    expect(result.channel).toBe('chat:tool-use-start');
    expect(result.args[0]).toEqual({
      id: 't1',
      name: 'Bash',
      input: { command: 'ls' },
      streamIndex: 2
    });
  });

  test('maps message-complete with empty args', () => {
    const result = runtimeEventToIpc({ type: 'message-complete' });
    expect(result).toEqual({ channel: 'chat:message-complete', args: [] });
  });

  test('maps message-error', () => {
    const result = runtimeEventToIpc({ type: 'message-error', error: 'rate limit' });
    expect(result).toEqual({ channel: 'chat:message-error', args: ['rate limit'] });
  });

  test('maps tool-result-complete', () => {
    const result = runtimeEventToIpc({
      type: 'tool-result-complete',
      toolUseId: 't1',
      content: 'output',
      isError: false
    });
    expect(result.channel).toBe('chat:tool-result-complete');
    expect(result.args[0]).toEqual({ toolUseId: 't1', content: 'output', isError: false });
  });

  test('maps session-updated', () => {
    const result = runtimeEventToIpc({
      type: 'session-updated',
      sessionId: 'sess-1',
      resumed: true
    });
    expect(result.channel).toBe('chat:session-updated');
    expect(result.args[0]).toEqual({ sessionId: 'sess-1', resumed: true });
  });
});
