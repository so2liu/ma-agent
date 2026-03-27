/**
 * Core types for the coding agent system.
 *
 * The coding agent system allows the Pi Agent (orchestrator) to spawn and manage
 * background coding tasks powered by Claude Code or Codex.
 */

/** Supported coding agent engines. */
export type CodingEngine = 'claude-code' | 'codex';

/** Task lifecycle status. */
export type CodingTaskStatus = 'running' | 'waiting' | 'completed' | 'failed' | 'stopped';

/** Events emitted by a coding task. */
export type CodingTaskEvent =
  | { type: 'progress'; message: string }
  | { type: 'question'; message: string }
  | { type: 'completed'; message: string }
  | { type: 'error'; message: string };

export type CodingTaskEventHandler = (taskId: string, event: CodingTaskEvent) => void;

/** Metadata for a single coding task. */
export interface CodingTask {
  id: string;
  /** The chat session that created this task — used to route notifications. */
  chatId: string;
  name: string;
  engine: CodingEngine;
  status: CodingTaskStatus;
  cwd: string;
  prompt: string;
  /** Accumulated output lines (progress/messages from the sub-agent). */
  output: string[];
  /** Non-null when the sub-agent is waiting for a response. */
  pendingQuestion: string | null;
  /** Final result text on completion. */
  result: string | null;
  /** Error message on failure. */
  error: string | null;
  createdAt: number;
  updatedAt: number;
}

/** Options for starting a coding task. */
export interface StartCodingTaskOptions {
  /** The chat session that creates this task. */
  chatId: string;
  name: string;
  engine: CodingEngine;
  prompt: string;
  cwd: string;
}

/** Serializable task info returned to the Pi Agent tools. */
export interface CodingTaskInfo {
  id: string;
  name: string;
  engine: CodingEngine;
  status: CodingTaskStatus;
  pendingQuestion: string | null;
  result: string | null;
  error: string | null;
  /** Last N output lines (to avoid overwhelming the LLM). */
  recentOutput: string[];
  createdAt: number;
  updatedAt: number;
}
