/**
 * ReplayRuntime — replays recorded SDK event traces from JSONL session logs.
 *
 * The JSONL format matches what session-logger.ts writes:
 *   { "ts": 1234567890, "event": { "type": "stream_event", ... } }
 *
 * This runtime translates recorded SDK events back into RuntimeEvents,
 * allowing regression tests to replay real sessions without calling the API.
 * It maintains a streamIndex→toolId mapping for faithful tool correlation during replay.
 *
 * Events are emitted asynchronously (one per microtask) to support interruption.
 */

import { readFileSync } from 'fs';

import type { ChatModelPreference } from '../../shared/types/ipc';
import type {
  AgentRuntime,
  RuntimeEvent,
  RuntimeEventHandler,
  RuntimeMessage
} from './agent-runtime';

interface SessionLogEntry {
  ts: number;
  event: {
    type: string;
    [key: string]: unknown;
  };
}

export class ReplayRuntime implements AgentRuntime {
  private handlers = new Set<RuntimeEventHandler>();
  private active = false;
  private interrupted = false;
  private preference: ChatModelPreference;
  private eventSequence: RuntimeEvent[];
  private consumed = false;

  constructor(events: RuntimeEvent[], preference: ChatModelPreference = 'fast') {
    this.eventSequence = events;
    this.preference = preference;
  }

  /**
   * Load from a JSONL session log file.
   * Maps SDK event types to RuntimeEvent types, maintaining tool ID correlation.
   */
  static fromJsonl(filePath: string): ReplayRuntime {
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter((line) => line.trim().length > 0);

    const runtimeEvents: RuntimeEvent[] = [];
    // Track streamIndex → toolId mapping to preserve tool correlation during replay.
    const streamIndexToToolId = new Map<number, string>();

    for (const line of lines) {
      const entry = JSON.parse(line) as SessionLogEntry;
      const mapped = mapSdkEventToRuntimeEvent(entry.event, streamIndexToToolId);
      if (mapped) {
        runtimeEvents.push(mapped);
      }
    }

    return new ReplayRuntime(runtimeEvents);
  }

  async sendMessage(_message: RuntimeMessage): Promise<void> {
    if (this.consumed) {
      throw new Error('ReplayRuntime: session trace already consumed');
    }
    this.consumed = true;
    this.active = true;
    this.interrupted = false;
    for (const event of this.eventSequence) {
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
    this.consumed = false;
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

// ── SDK event → RuntimeEvent mapping ────────────────────────────────────────

function mapSdkEventToRuntimeEvent(
  sdkEvent: Record<string, unknown>,
  streamIndexToToolId: Map<number, string>
): RuntimeEvent | null {
  if (sdkEvent.type === 'stream_event') {
    return mapStreamEvent(sdkEvent.event as Record<string, unknown>, streamIndexToToolId);
  }
  if (sdkEvent.type === 'result') {
    return { type: 'message-complete' };
  }
  if (sdkEvent.type === 'system' && sdkEvent.subtype === 'init' && sdkEvent.session_id) {
    return {
      type: 'session-updated',
      sessionId: sdkEvent.session_id as string,
      resumed: false
    };
  }
  // assistant-type events with tool results
  if (sdkEvent.type === 'assistant') {
    return mapAssistantEvent(sdkEvent);
  }
  return null;
}

function mapAssistantEvent(sdkEvent: Record<string, unknown>): RuntimeEvent | null {
  const message = sdkEvent.message as Record<string, unknown> | undefined;
  if (!message) return null;

  const content = message.content as Record<string, unknown>[] | undefined;
  if (!Array.isArray(content)) return null;

  // Find the last tool result block and emit it
  for (const block of content) {
    if (
      typeof block === 'object' &&
      block !== null &&
      'tool_use_id' in block &&
      'content' in block
    ) {
      const toolUseId = block.tool_use_id as string;
      const rawContent = block.content;
      const contentStr =
        typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent, null, 2);
      const isError = (block.is_error as boolean) || false;
      return {
        type: 'tool-result-complete',
        toolUseId,
        content: contentStr,
        isError
      };
    }
  }
  return null;
}

function mapStreamEvent(
  event: Record<string, unknown>,
  streamIndexToToolId: Map<number, string>
): RuntimeEvent | null {
  if (event.type === 'content_block_delta') {
    const delta = event.delta as Record<string, unknown>;
    const index = event.index as number;
    if (delta.type === 'text_delta') {
      return { type: 'message-chunk', text: delta.text as string };
    }
    if (delta.type === 'thinking_delta') {
      return { type: 'thinking-chunk', index, delta: delta.thinking as string };
    }
    if (delta.type === 'input_json_delta') {
      const toolId = streamIndexToToolId.get(index) ?? '';
      return { type: 'tool-input-delta', index, toolId, delta: delta.partial_json as string };
    }
  }

  if (event.type === 'content_block_start') {
    const block = event.content_block as Record<string, unknown>;
    const index = event.index as number;
    if (block.type === 'thinking') {
      return { type: 'thinking-start', index };
    }
    if (block.type === 'tool_use') {
      const toolId = block.id as string;
      streamIndexToToolId.set(index, toolId);
      return {
        type: 'tool-use-start',
        id: toolId,
        name: block.name as string,
        input: (block.input as Record<string, unknown>) || {},
        streamIndex: index
      };
    }
  }

  if (event.type === 'content_block_stop') {
    const index = event.index as number;
    const toolId = streamIndexToToolId.get(index);
    return { type: 'content-block-stop', index, toolId };
  }

  return null;
}
