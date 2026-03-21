import type { ToolUse } from '@/electron';
import type { ErrorActionType } from '@/utils/friendlyError';

export interface AgentInput {
  prompt?: string;
  subagent_type?: string;
  model?: string;
}

export interface BashInput {
  command: string;
  timeout?: number;
  description?: string;
  run_in_background?: boolean;
}

export interface ReadInput {
  file_path: string;
  offset?: number;
  limit?: number;
}

export interface WriteInput {
  file_path: string;
  content: string;
}

export interface EditInput {
  file_path: string;
  old_string: string;
  new_string: string;
  replace_all?: boolean;
}

export interface GlobInput {
  pattern: string;
  path?: string;
}

export interface GrepInput {
  pattern: string;
  path?: string;
  include?: string;
}

export interface TodoWriteInput {
  todos?: Array<{
    content: string;
    status?: 'pending' | 'in_progress' | 'completed';
  }>;
}

export interface WebFetchInput {
  url: string;
  prompt?: string;
}

export interface WebSearchInput {
  query: string;
  allowed_domains?: string[];
  blocked_domains?: string[];
}

export interface NotebookEditInput {
  notebook_path: string;
  cell_id?: string;
  cell_type?: 'code' | 'markdown';
  edit_mode?: 'replace' | 'insert' | 'delete';
  new_source?: string;
}

export type ToolInput =
  | AgentInput
  | BashInput
  | ReadInput
  | WriteInput
  | EditInput
  | GlobInput
  | GrepInput
  | TodoWriteInput
  | WebFetchInput
  | WebSearchInput
  | NotebookEditInput;

export interface ToolUseSimple extends ToolUse {
  inputJson?: string;
  parsedInput?: ToolInput;
  result?: string;
  isLoading?: boolean;
  isError?: boolean;
}

export interface ContentBlock {
  type: 'text' | 'tool_use' | 'thinking';
  text?: string;
  tool?: ToolUseSimple;
  thinking?: string;
  thinkingStartedAt?: number;
  thinkingDurationMs?: number;
  thinkingStreamIndex?: number;
  isComplete?: boolean;
}

export interface MessageAttachment {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  savedPath?: string;
  relativePath?: string;
  previewUrl?: string;
  isImage?: boolean;
}

export interface MessageErrorMeta {
  rawError: string;
  actionType?: ErrorActionType;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
  timestamp: Date;
  attachments?: MessageAttachment[];
  errorMeta?: MessageErrorMeta;
}
