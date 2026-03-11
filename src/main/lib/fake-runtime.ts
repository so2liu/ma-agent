/**
 * FakeRuntime — emits a predefined event sequence for unit/integration tests.
 *
 * Events are emitted asynchronously (one per microtask) to allow interrupt()
 * to stop delivery mid-stream, matching real runtime behavior.
 *
 * Usage:
 *   const runtime = new FakeRuntime([
 *     { type: 'message-chunk', text: 'Hello' },
 *     { type: 'message-complete' },
 *   ]);
 *   runtime.onEvent(handler);
 *   await runtime.sendMessage({ text: 'anything' });
 */

import type { ChatModelPreference } from '../../shared/types/ipc';
import type {
  AgentRuntime,
  RuntimeEvent,
  RuntimeEventHandler,
  RuntimeMessage
} from './agent-runtime';

export class FakeRuntime implements AgentRuntime {
  private handlers = new Set<RuntimeEventHandler>();
  private active = false;
  private interrupted = false;
  private preference: ChatModelPreference;

  /** Events to emit on each sendMessage call. Shifts from front on each call. */
  private sequences: RuntimeEvent[][];

  constructor(
    events: RuntimeEvent[] | RuntimeEvent[][],
    preference: ChatModelPreference = 'fast'
  ) {
    // If given a flat array, treat it as a single sequence
    if (events.length === 0 || !Array.isArray(events[0])) {
      this.sequences = [events as RuntimeEvent[]];
    } else {
      this.sequences = events as RuntimeEvent[][];
    }
    this.preference = preference;
  }

  async sendMessage(_message: RuntimeMessage): Promise<void> {
    const sequence = this.sequences.shift() ?? [];
    this.active = true;
    this.interrupted = false;
    for (const event of sequence) {
      // Yield to microtask queue so interrupt() can fire between events
      await Promise.resolve();
      if (this.interrupted) break;
      this.emit(event);
    }
    this.active = false;
  }

  async interrupt(): Promise<boolean> {
    if (!this.active) return false;
    this.interrupted = true;
    this.active = false;
    this.emit({ type: 'message-stopped' });
    return true;
  }

  async reset(): Promise<void> {
    this.interrupted = true;
    this.active = false;
  }

  isActive(): boolean {
    return this.active;
  }

  onEvent(handler: RuntimeEventHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  async setModelPreference(preference: ChatModelPreference): Promise<void> {
    this.preference = preference;
  }

  getModelPreference(): ChatModelPreference {
    return this.preference;
  }

  private emit(event: RuntimeEvent): void {
    for (const handler of this.handlers) {
      handler(event);
    }
  }
}
