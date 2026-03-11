// Shared IPC response types used by both main and renderer processes

export interface WorkspaceDirResponse {
  workspaceDir: string;
}

export interface SuccessResponse {
  success: boolean;
  error?: string;
}

/** Which agent runtime / LLM provider to use */
export type AgentProvider = 'anthropic' | 'openai';

export type ChatModelPreference = 'fast' | 'smart-sonnet' | 'smart-opus';

export const MODEL_LABELS: Record<ChatModelPreference, string> = {
  fast: '快速',
  'smart-sonnet': '均衡',
  'smart-opus': '强力'
};

/** Default model IDs — single source of truth for both runtime and UI */
export const DEFAULT_MODEL_IDS: Record<ChatModelPreference, string> = {
  fast: 'claude-haiku-4-5-20251001',
  'smart-sonnet': 'claude-sonnet-4-5-20250929',
  'smart-opus': 'claude-opus-4-5-20251101'
};

/** Friendly display names for the default models */
export const DEFAULT_MODEL_NAMES: Record<ChatModelPreference, string> = {
  fast: 'Claude Haiku 4.5',
  'smart-sonnet': 'Claude Sonnet 4.5',
  'smart-opus': 'Claude Opus 4.5'
};

export const MODEL_TOOLTIPS: Record<
  ChatModelPreference,
  { description: string; suggestions: string[] }
> = {
  fast: {
    description: '响应速度最快，适合简单的翻译、问答、格式转换等任务',
    suggestions: [DEFAULT_MODEL_IDS.fast, DEFAULT_MODEL_IDS['smart-sonnet']]
  },
  'smart-sonnet': {
    description: '速度和质量兼顾，适合日常办公使用（推荐）',
    suggestions: [DEFAULT_MODEL_IDS['smart-sonnet'], DEFAULT_MODEL_IDS['smart-opus']]
  },
  'smart-opus': {
    description: '最强大的分析能力，适合复杂数据分析、长文写作',
    suggestions: [DEFAULT_MODEL_IDS['smart-opus'], DEFAULT_MODEL_IDS['smart-sonnet']]
  }
};

export type CustomModelIds = Partial<Record<ChatModelPreference, string>>;

export interface SerializedAttachmentPayload {
  name: string;
  mimeType: string;
  size: number;
  data: ArrayBuffer | Uint8Array;
}

export interface SendMessagePayload {
  text: string;
  attachments?: SerializedAttachmentPayload[];
}

export interface GetChatModelPreferenceResponse {
  preference: ChatModelPreference;
}

export interface SetChatModelPreferenceResponse extends SuccessResponse {
  preference: ChatModelPreference;
}

export interface SavedAttachmentInfo {
  name: string;
  mimeType: string;
  size: number;
  savedPath: string;
  relativePath: string;
}

export interface SendMessageResponse {
  success: boolean;
  error?: string;
  attachments?: SavedAttachmentInfo[];
}

export interface ShellResponse {
  success: boolean;
  error?: string;
}

/** OpenAI provider configuration */
export interface OpenAIConfig {
  apiKey?: string;
  baseUrl?: string;
  modelId?: string;
}

/** Detail of the server-side NLP extraction step */
export interface ServerExtractionDetail {
  success: boolean;
  baseUrl?: string;
  modelId?: string;
  error?: string;
}

/** Parsed API config from server-side NLP extraction */
export interface ParsedApiConfig {
  apiKey?: string;
  baseUrl?: string;
  modelId?: string;
  error?: string;
  /** Verbose detail of what the server returned */
  serverDetail?: ServerExtractionDetail;
}

/** Detail of a single provider probe attempt */
export interface ProbeDetail {
  provider: AgentProvider;
  success: boolean;
  model?: string;
  error?: string;
  /** Available model IDs (when probe lists models) */
  modelCount?: number;
}

/** Result of auto-detecting provider type */
export interface AutoDetectResult {
  success: boolean;
  provider?: AgentProvider;
  model?: string;
  error?: string;
  /** Details of each probe attempt, in order tried */
  probes?: ProbeDetail[];
  /** Available model IDs from successful provider */
  availableModels?: string[];
}

/** AI-recommended models for the 3 preference tiers */
export interface ModelRecommendation {
  fast: string;
  'smart-sonnet': string;
  'smart-opus': string;
}

/** Default OpenAI model IDs per preference tier */
export const DEFAULT_OPENAI_MODEL_IDS: Record<ChatModelPreference, string> = {
  fast: 'gpt-4.1-mini',
  'smart-sonnet': 'gpt-4.1',
  'smart-opus': 'gpt-5'
};

/** Friendly display names for the default OpenAI models */
export const DEFAULT_OPENAI_MODEL_NAMES: Record<ChatModelPreference, string> = {
  fast: 'GPT-4.1 Mini',
  'smart-sonnet': 'GPT-4.1',
  'smart-opus': 'GPT-5'
};
