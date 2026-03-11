import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import type { RuntimeEvent } from './agent-runtime';
import { ReplayRuntime } from './replay-runtime';

describe('ReplayRuntime', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'replay-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true });
  });

  function writeJsonl(filename: string, entries: unknown[]): string {
    const path = join(tempDir, filename);
    const content = entries.map((e) => JSON.stringify(e)).join('\n');
    writeFileSync(path, content, 'utf-8');
    return path;
  }

  test('parses JSONL and replays text_delta events', async () => {
    const path = writeJsonl('session.jsonl', [
      {
        ts: 1000,
        event: {
          type: 'stream_event',
          event: {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'text_delta', text: 'Hello' }
          }
        }
      },
      {
        ts: 2000,
        event: {
          type: 'stream_event',
          event: {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'text_delta', text: ' world' }
          }
        }
      },
      { ts: 3000, event: { type: 'result' } }
    ]);

    const runtime = ReplayRuntime.fromJsonl(path);
    const received: RuntimeEvent[] = [];
    runtime.onEvent((e) => received.push(e));

    await runtime.sendMessage({ text: 'ignored' });

    expect(received).toEqual([
      { type: 'message-chunk', text: 'Hello' },
      { type: 'message-chunk', text: ' world' },
      { type: 'message-complete' }
    ]);
  });

  test('parses thinking events', async () => {
    const path = writeJsonl('thinking.jsonl', [
      {
        ts: 1000,
        event: {
          type: 'stream_event',
          event: {
            type: 'content_block_start',
            index: 0,
            content_block: { type: 'thinking' }
          }
        }
      },
      {
        ts: 1100,
        event: {
          type: 'stream_event',
          event: {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'thinking_delta', thinking: 'let me think...' }
          }
        }
      }
    ]);

    const runtime = ReplayRuntime.fromJsonl(path);
    const received: RuntimeEvent[] = [];
    runtime.onEvent((e) => received.push(e));

    await runtime.sendMessage({ text: 'test' });

    expect(received[0]).toEqual({ type: 'thinking-start', index: 0 });
    expect(received[1]).toEqual({ type: 'thinking-chunk', index: 0, delta: 'let me think...' });
  });

  test('parses tool_use events', async () => {
    const path = writeJsonl('tools.jsonl', [
      {
        ts: 1000,
        event: {
          type: 'stream_event',
          event: {
            type: 'content_block_start',
            index: 1,
            content_block: { type: 'tool_use', id: 'tool-1', name: 'Bash', input: {} }
          }
        }
      },
      {
        ts: 2000,
        event: {
          type: 'stream_event',
          event: { type: 'content_block_stop', index: 1 }
        }
      }
    ]);

    const runtime = ReplayRuntime.fromJsonl(path);
    const received: RuntimeEvent[] = [];
    runtime.onEvent((e) => received.push(e));

    await runtime.sendMessage({ text: 'test' });

    expect(received[0]).toEqual({
      type: 'tool-use-start',
      id: 'tool-1',
      name: 'Bash',
      input: {},
      streamIndex: 1
    });
    expect(received[1]).toEqual({ type: 'content-block-stop', index: 1, toolId: 'tool-1' });
  });

  test('parses session init event', async () => {
    const path = writeJsonl('init.jsonl', [
      {
        ts: 1000,
        event: { type: 'system', subtype: 'init', session_id: 'sess-abc' }
      }
    ]);

    const runtime = ReplayRuntime.fromJsonl(path);
    const received: RuntimeEvent[] = [];
    runtime.onEvent((e) => received.push(e));

    await runtime.sendMessage({ text: 'test' });

    expect(received[0]).toEqual({
      type: 'session-updated',
      sessionId: 'sess-abc',
      resumed: false
    });
  });

  test('throws when trace already consumed', async () => {
    const runtime = new ReplayRuntime([{ type: 'message-complete' }]);
    await runtime.sendMessage({ text: 'first' });

    expect(runtime.sendMessage({ text: 'second' })).rejects.toThrow('already consumed');
  });

  test('reset allows replaying again', async () => {
    const runtime = new ReplayRuntime([
      { type: 'message-chunk', text: 'hi' },
      { type: 'message-complete' }
    ]);
    const received: RuntimeEvent[] = [];
    runtime.onEvent((e) => received.push(e));

    await runtime.sendMessage({ text: 'first' });
    expect(received).toHaveLength(2);

    await runtime.reset();
    await runtime.sendMessage({ text: 'second' });
    expect(received).toHaveLength(4);
  });

  test('preserves tool ID correlation across stream events', async () => {
    const path = writeJsonl('tool-correlation.jsonl', [
      {
        ts: 1000,
        event: {
          type: 'stream_event',
          event: {
            type: 'content_block_start',
            index: 2,
            content_block: { type: 'tool_use', id: 'toolu_abc', name: 'Read', input: {} }
          }
        }
      },
      {
        ts: 1100,
        event: {
          type: 'stream_event',
          event: {
            type: 'content_block_delta',
            index: 2,
            delta: { type: 'input_json_delta', partial_json: '{"path":' }
          }
        }
      },
      {
        ts: 1200,
        event: {
          type: 'stream_event',
          event: { type: 'content_block_stop', index: 2 }
        }
      }
    ]);

    const runtime = ReplayRuntime.fromJsonl(path);
    const received: RuntimeEvent[] = [];
    runtime.onEvent((e) => received.push(e));
    await runtime.sendMessage({ text: 'test' });

    // tool-input-delta should have the correct toolId from content_block_start
    expect(received[1]).toEqual({
      type: 'tool-input-delta',
      index: 2,
      toolId: 'toolu_abc',
      delta: '{"path":'
    });
    // content-block-stop should also have the toolId
    expect(received[2]).toEqual({
      type: 'content-block-stop',
      index: 2,
      toolId: 'toolu_abc'
    });
  });

  test('maps assistant events with tool results', async () => {
    const path = writeJsonl('assistant.jsonl', [
      {
        ts: 1000,
        event: {
          type: 'assistant',
          message: {
            content: [
              {
                tool_use_id: 'toolu_xyz',
                content: 'file contents here',
                is_error: false
              }
            ]
          }
        }
      }
    ]);

    const runtime = ReplayRuntime.fromJsonl(path);
    const received: RuntimeEvent[] = [];
    runtime.onEvent((e) => received.push(e));
    await runtime.sendMessage({ text: 'test' });

    expect(received[0]).toEqual({
      type: 'tool-result-complete',
      toolUseId: 'toolu_xyz',
      content: 'file contents here',
      isError: false
    });
  });

  test('skips unknown event types gracefully', async () => {
    const path = writeJsonl('mixed.jsonl', [
      { ts: 1000, event: { type: 'unknown_event', data: 'foo' } },
      {
        ts: 2000,
        event: {
          type: 'stream_event',
          event: {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'text_delta', text: 'real' }
          }
        }
      },
      { ts: 3000, event: { type: 'result' } }
    ]);

    const runtime = ReplayRuntime.fromJsonl(path);
    const received: RuntimeEvent[] = [];
    runtime.onEvent((e) => received.push(e));

    await runtime.sendMessage({ text: 'test' });

    expect(received).toEqual([
      { type: 'message-chunk', text: 'real' },
      { type: 'message-complete' }
    ]);
  });
});
