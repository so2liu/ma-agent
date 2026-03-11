import { describe, expect, test } from 'bun:test';

import type { RuntimeEvent } from './agent-runtime';
import { FakeRuntime } from './fake-runtime';

describe('FakeRuntime', () => {
  test('emits all events in order to subscribers', async () => {
    const events: RuntimeEvent[] = [
      { type: 'message-chunk', text: 'Hello' },
      { type: 'message-chunk', text: ' world' },
      { type: 'message-complete' }
    ];
    const runtime = new FakeRuntime(events);
    const received: RuntimeEvent[] = [];
    runtime.onEvent((e) => received.push(e));

    await runtime.sendMessage({ text: 'anything' });

    expect(received).toEqual(events);
  });

  test('reports isActive correctly during sendMessage', async () => {
    const wasActive: boolean[] = [];
    const runtime = new FakeRuntime([{ type: 'message-complete' }]);
    runtime.onEvent(() => wasActive.push(runtime.isActive()));

    expect(runtime.isActive()).toBe(false);
    await runtime.sendMessage({ text: 'test' });
    expect(runtime.isActive()).toBe(false);
    // During event emission, runtime should be active
    expect(wasActive).toEqual([true]);
  });

  test('multiple subscribers receive all events', async () => {
    const runtime = new FakeRuntime([{ type: 'message-chunk', text: 'hi' }]);
    const a: RuntimeEvent[] = [];
    const b: RuntimeEvent[] = [];
    runtime.onEvent((e) => a.push(e));
    runtime.onEvent((e) => b.push(e));

    await runtime.sendMessage({ text: 'test' });
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
  });

  test('unsubscribe stops delivery', async () => {
    const runtime = new FakeRuntime([
      [{ type: 'message-chunk', text: 'first' }],
      [{ type: 'message-chunk', text: 'second' }]
    ]);
    const received: RuntimeEvent[] = [];
    const unsub = runtime.onEvent((e) => received.push(e));

    await runtime.sendMessage({ text: 'one' });
    expect(received).toHaveLength(1);

    unsub();
    await runtime.sendMessage({ text: 'two' });
    expect(received).toHaveLength(1); // no new events
  });

  test('supports multi-turn sequences', async () => {
    const runtime = new FakeRuntime([
      [{ type: 'message-chunk', text: 'turn 1' }, { type: 'message-complete' }],
      [{ type: 'message-chunk', text: 'turn 2' }, { type: 'message-complete' }]
    ]);
    const received: RuntimeEvent[] = [];
    runtime.onEvent((e) => received.push(e));

    await runtime.sendMessage({ text: 'first' });
    expect(received).toHaveLength(2);

    await runtime.sendMessage({ text: 'second' });
    expect(received).toHaveLength(4);
    expect((received[2] as { type: string; text: string }).text).toBe('turn 2');
  });

  test('model preference get/set', async () => {
    const runtime = new FakeRuntime([]);
    expect(runtime.getModelPreference()).toBe('fast');
    await runtime.setModelPreference('smart-opus');
    expect(runtime.getModelPreference()).toBe('smart-opus');
  });

  test('interrupt returns false when not active', async () => {
    const runtime = new FakeRuntime([]);
    expect(await runtime.interrupt()).toBe(false);
  });

  test('emits empty sequence without error', async () => {
    const runtime = new FakeRuntime([]);
    const received: RuntimeEvent[] = [];
    runtime.onEvent((e) => received.push(e));
    await runtime.sendMessage({ text: 'test' });
    expect(received).toHaveLength(0);
  });
});
