export interface TaskProgressEvent {
  taskId: string;
  toolUseId?: string;
  description: string;
  totalTokens: number;
  toolUses: number;
  durationMs: number;
  lastToolName?: string;
}

export interface TaskNotificationEvent {
  taskId: string;
  toolUseId?: string;
  status: 'completed' | 'failed' | 'stopped';
  outputFile: string;
  summary: string;
  totalTokens?: number;
  toolUses?: number;
  durationMs?: number;
}

export interface BackgroundTask {
  taskId: string;
  toolUseId?: string;
  description: string;
  status: 'running' | 'completed' | 'failed' | 'stopped';
  totalTokens: number;
  toolUses: number;
  durationMs: number;
  lastToolName?: string;
  summary?: string;
  outputFile?: string;
}
