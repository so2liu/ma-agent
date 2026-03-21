/**
 * AgentRuntime abstraction — decouples chat handlers from specific LLM providers.
 *
 * Current implementations (for testing):
 *   - FakeRuntime    (unit tests — predefined event sequences)
 *   - ReplayRuntime  (regression tests — replays JSONL session logs)
 */

import type { ChatModelPreference, SavedAttachmentInfo } from '../../shared/types/ipc';

// ── Message type ────────────────────────────────────────────────────────────

/** Structured message that supports text + attachments. */
export interface RuntimeMessage {
  text: string;
  attachments?: SavedAttachmentInfo[];
}

// ── Events emitted by any runtime ───────────────────────────────────────────

export type RuntimeEvent =
  | { type: 'message-chunk'; text: string }
  | { type: 'thinking-start'; index: number }
  | { type: 'thinking-chunk'; index: number; delta: string }
  | {
      type: 'tool-use-start';
      id: string;
      name: string;
      input: Record<string, unknown>;
      streamIndex: number;
    }
  | { type: 'tool-input-delta'; index: number; toolId: string; delta: string }
  | { type: 'tool-result-start'; toolUseId: string; content: string; isError: boolean }
  | { type: 'tool-result-complete'; toolUseId: string; content: string; isError: boolean }
  | { type: 'content-block-stop'; index: number; toolId?: string }
  | { type: 'session-updated'; sessionId: string; resumed: boolean }
  | { type: 'message-complete' }
  | { type: 'message-stopped' }
  | { type: 'message-error'; error: string }
  | { type: 'debug-message'; message: string };

export type RuntimeEventHandler = (event: RuntimeEvent) => void;

// ── Interface ───────────────────────────────────────────────────────────────

export interface AgentRuntime {
  /** Send a user message (text + optional attachments). Starts session if not active. */
  sendMessage(message: RuntimeMessage): Promise<void>;

  /** Interrupt the current response. Returns true if interrupted. */
  interrupt(): Promise<boolean>;

  /** Reset/destroy the session. Optional resumeSessionId for session resume. */
  reset(resumeSessionId?: string | null): Promise<void>;

  /** Whether the runtime is currently processing a message. */
  isActive(): boolean;

  /** Subscribe to runtime events. Returns unsubscribe function. */
  onEvent(handler: RuntimeEventHandler): () => void;

  /** Set model preference. */
  setModelPreference(preference: ChatModelPreference): Promise<void>;

  /** Get current model preference. */
  getModelPreference(): ChatModelPreference;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Map a RuntimeEvent to the IPC channel name and arguments the renderer expects. */
export function runtimeEventToIpc(
  event: RuntimeEvent,
  chatId: string
): { channel: string; args: unknown[] } {
  switch (event.type) {
    case 'message-chunk':
      return { channel: 'chat:message-chunk', args: [{ chatId, chunk: event.text }] };
    case 'thinking-start':
      return { channel: 'chat:thinking-start', args: [{ chatId, index: event.index }] };
    case 'thinking-chunk':
      return {
        channel: 'chat:thinking-chunk',
        args: [{ chatId, index: event.index, delta: event.delta }]
      };
    case 'tool-use-start':
      return {
        channel: 'chat:tool-use-start',
        args: [
          {
            chatId,
            id: event.id,
            name: event.name,
            input: event.input,
            streamIndex: event.streamIndex
          }
        ]
      };
    case 'tool-input-delta':
      return {
        channel: 'chat:tool-input-delta',
        args: [{ chatId, index: event.index, toolId: event.toolId, delta: event.delta }]
      };
    case 'tool-result-start':
      return {
        channel: 'chat:tool-result-start',
        args: [
          {
            chatId,
            toolUseId: event.toolUseId,
            content: event.content,
            isError: event.isError
          }
        ]
      };
    case 'tool-result-complete':
      return {
        channel: 'chat:tool-result-complete',
        args: [
          {
            chatId,
            toolUseId: event.toolUseId,
            content: event.content,
            isError: event.isError
          }
        ]
      };
    case 'content-block-stop':
      return {
        channel: 'chat:content-block-stop',
        args: [{ chatId, index: event.index, toolId: event.toolId }]
      };
    case 'session-updated':
      return {
        channel: 'chat:session-updated',
        args: [{ chatId, sessionId: event.sessionId, resumed: event.resumed }]
      };
    case 'message-complete':
      return { channel: 'chat:message-complete', args: [{ chatId }] };
    case 'message-stopped':
      return { channel: 'chat:message-stopped', args: [{ chatId }] };
    case 'message-error':
      return { channel: 'chat:message-error', args: [{ chatId, error: event.error }] };
    case 'debug-message':
      return { channel: 'chat:debug-message', args: [{ chatId, message: event.message }] };
  }
}
