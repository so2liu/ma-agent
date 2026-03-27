/** Types for coding task IPC events between main process and renderer. */

export type CodingTaskUIStatus = 'running' | 'waiting' | 'completed' | 'failed' | 'stopped';

/** Sent to renderer on every coding task event. */
export interface CodingTaskUpdateEvent {
  chatId: string;
  taskId: string;
  name: string;
  engine: 'claude-code' | 'codex';
  status: CodingTaskUIStatus;
  /** The latest output line (progress only). */
  outputLine?: string;
  /** Non-null when the sub-agent is waiting for a response. */
  pendingQuestion?: string;
  /** Final result text on completion. */
  result?: string;
  /** Error message on failure. */
  error?: string;
}

/** State held in the renderer for a single coding task. */
export interface CodingTaskState {
  taskId: string;
  name: string;
  engine: 'claude-code' | 'codex';
  status: CodingTaskUIStatus;
  /** Accumulated output lines for the detail view. */
  outputLines: string[];
  pendingQuestion: string | null;
  result: string | null;
  error: string | null;
}
