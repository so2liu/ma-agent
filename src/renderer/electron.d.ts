import type { AnalyticsEvent, AnalyticsSettings, MessageFeedback } from '../shared/types/analytics';
import type { SimpleElement } from '../shared/types/canvas';
import type { TaskNotificationEvent, TaskProgressEvent } from '../shared/types/background-task';
import type {
  AgentProvider,
  AutoDetectResult,
  ChatModelPreference,
  CustomModelIds,
  GetChatModelPreferenceResponse,
  ModelRecommendation,
  OpenAIConfig,
  ParsedApiConfig,
  SendMessagePayload,
  SendMessageResponse,
  SetChatModelPreferenceResponse
} from '../shared/types/ipc';
import type { SkillManifest } from '../shared/types/skill-manifest';

export type ChatResponse = SendMessageResponse;

export interface WorkspaceResponse {
  workspaceDir: string;
}

export interface SetWorkspaceResponse {
  success: boolean;
  error?: string;
}

export interface PathInfoResponse {
  platform: string;
  pathSeparator: string;
  pathEntries: string[];
  pathCount: number;
  fullPath: string;
}

export interface EnvVar {
  key: string;
  value: string;
}

export interface EnvVarsResponse {
  envVars: EnvVar[];
  count: number;
}

export interface DiagnosticMetadataResponse {
  appVersion: string;
  electronVersion: string;
  chromiumVersion: string;
  v8Version: string;
  nodeVersion: string;
  claudeAgentSdkVersion: string;
  platform: string;
  arch: string;
  osRelease: string;
  osType: string;
  osVersion: string;
}

export interface ToolUse {
  id: string;
  name: string;
  input: Record<string, unknown>;
  streamIndex: number;
}

export interface ToolInputDelta {
  index: number;
  toolId: string;
  delta: string;
}

export interface ContentBlockStop {
  index: number;
  toolId?: string;
}

export interface ToolResultStart {
  toolUseId: string;
  content: string;
  isError: boolean;
}

export interface ToolResultDelta {
  toolUseId: string;
  delta: string;
}

export interface ToolResultComplete {
  toolUseId: string;
  content: string;
  isError?: boolean;
}

export interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileTreeNode[];
}

export interface WorkspaceListResponse {
  success: boolean;
  files: FileTreeNode[];
  workspaceDir: string;
  error?: string;
}

export interface WorkspaceReadFileResponse {
  success: boolean;
  content?: string;
  mimeType?: string;
  isText?: boolean;
  error?: string;
}

export type AppStatus = 'stopped' | 'installing' | 'developing' | 'building' | 'running';

export interface AppInfo {
  id: string;
  name: string;
  description: string;
  icon: string;
  status: AppStatus;
  lanUrl: string | null;
  localUrl: string | null;
  port: number | null;
  conversationId: string | null;
}

export interface AppScanResponse {
  success: boolean;
  apps: AppInfo[];
  error?: string;
}

export interface AppPublishResponse {
  success: boolean;
  lanUrl?: string;
  localUrl?: string;
  port?: number;
  error?: string;
}

export interface UpdateInfo {
  version: string;
  releaseDate: string;
  releaseNotes?: string;
}

export type UpdateChannel = 'stable' | 'nightly';

export interface UpdateStatus {
  checking: boolean;
  updateAvailable: boolean;
  downloading: boolean;
  downloadProgress: number;
  readyToInstall: boolean;
  error: string | null;
  updateInfo: UpdateInfo | null;
  lastCheckComplete: boolean;
  updateChannel: UpdateChannel;
}

export interface ThinkingStart {
  index: number;
}

export interface ThinkingChunk {
  index: number;
  delta: string;
}

export interface Conversation {
  id: string;
  title: string;
  messages: string; // JSON stringified Message[]
  createdAt: number;
  updatedAt: number;
  sessionId?: string | null;
  projectId?: string | null;
}

/** Lightweight version returned by conversation:list — no full messages payload */
export interface ConversationSummary extends Omit<Conversation, 'messages'> {
  preview: string;
}

export interface Project {
  id: string;
  name: string;
  order: number;
  isArchived: boolean;
  isDefault?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface ProjectListResponse {
  success: boolean;
  projects?: Project[];
  error?: string;
}

export interface ProjectCreateResponse {
  success: boolean;
  project?: Project;
  error?: string;
}

export interface ProjectUpdateResponse {
  success: boolean;
  project?: Project;
  error?: string;
}

export interface ConversationListResponse {
  success: boolean;
  conversations?: ConversationSummary[];
  error?: string;
}

export interface ConversationGetResponse {
  success: boolean;
  conversation?: Conversation;
  error?: string;
}

export interface ConversationCreateResponse {
  success: boolean;
  conversation?: Conversation;
  error?: string;
}

export interface ConversationUpdateResponse {
  success: boolean;
  error?: string;
}

export interface ConversationDeleteResponse {
  success: boolean;
  error?: string;
}

export interface ConversationSearchTitleMatch {
  conversationId: string;
  title: string;
  updatedAt: number;
}

export interface ConversationSearchResult {
  conversationId: string;
  title: string;
  matchSnippet: string;
  matchRole: 'user' | 'assistant';
  updatedAt: number;
}

export interface ConversationSearchResponse {
  success: boolean;
  titleMatches?: ConversationSearchTitleMatch[];
  contentMatches?: ConversationSearchResult[];
  hasMore?: boolean;
  error?: string;
}

export interface RetryStatus {
  attempt: number;
  maxAttempts: number;
  retryInMs: number;
}

export interface ChatMessageChunkEvent {
  chatId: string;
  chunk: string;
}

export interface ChatLifecycleEvent {
  chatId: string;
}

export interface ChatMessageErrorEvent {
  chatId: string;
  error: string;
}

export interface ChatRetryStatusEvent extends RetryStatus {
  chatId: string;
}

export interface ChatDebugMessageEvent {
  chatId: string;
  message: string;
}

export interface ChatThinkingStartEvent extends ThinkingStart {
  chatId: string;
}

export interface ChatThinkingChunkEvent extends ThinkingChunk {
  chatId: string;
}

export interface ChatToolUseStartEvent extends ToolUse {
  chatId: string;
}

export interface ChatToolInputDeltaEvent extends ToolInputDelta {
  chatId: string;
}

export interface ChatContentBlockStopEvent extends ContentBlockStop {
  chatId: string;
}

export interface ChatToolResultStartEvent extends ToolResultStart {
  chatId: string;
}

export interface ChatToolResultDeltaEvent extends ToolResultDelta {
  chatId: string;
}

export interface ChatToolResultCompleteEvent extends ToolResultComplete {
  chatId: string;
}

export interface ChatSessionUpdatedEvent {
  chatId: string;
  sessionId: string;
  resumed: boolean;
}

export interface SkillInfo {
  name: string;
  manifest: SkillManifest | null;
  isBuiltin: boolean;
}

export interface SkillListResponse {
  success: boolean;
  skills: SkillInfo[];
  error?: string;
}

export interface DiscoveredSkill {
  id: string;
  name: string;
  version: string;
  description: string;
  tags?: string[];
  author?: string;
}

export interface DiscoveredPeer {
  instanceId: string;
  hostname: string;
  httpPort: number;
  skills: DiscoveredSkill[];
  lastSeen: number;
}

export interface SkillDiscoverResponse {
  success: boolean;
  peers: DiscoveredPeer[];
  error?: string;
}

export interface DbColumn {
  name: string;
  type: string;
  pk: boolean;
}

export interface DbQueryResponse {
  success: boolean;
  rows?: Record<string, unknown>[];
  columns?: DbColumn[];
  total?: number;
  page?: number;
  pageSize?: number;
  isRecordsTable?: boolean;
  error?: string;
}

export interface ScheduledTask {
  id: string;
  name: string;
  prompt: string;
  cronExpression: string;
  enabled: boolean;
  modelPreference: ChatModelPreference;
  lastRunAt?: number;
  lastRunStatus?: 'success' | 'error' | 'skipped';
  lastRunConversationId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ScheduleListResponse {
  success: boolean;
  tasks?: ScheduledTask[];
  error?: string;
}

export interface ScheduleTaskResponse {
  success: boolean;
  task?: ScheduledTask;
  error?: string;
}

export interface ScheduleRunResponse {
  success: boolean;
  conversationId?: string;
  error?: string;
}

export interface ElectronAPI {
  onNavigate: (callback: (view: string) => void) => () => void;
  chat: {
    sendMessage: (payload: SendMessagePayload) => Promise<ChatResponse>;
    stopMessage: (chatId: string) => Promise<{ success: boolean; error?: string }>;
    destroySession: (chatId: string) => Promise<{ success: boolean; error?: string }>;
    resetSession: (
      chatId: string,
      resumeSessionId?: string | null
    ) => Promise<{ success: boolean; error?: string }>;
    getModelPreference: () => Promise<GetChatModelPreferenceResponse>;
    setModelPreference: (
      preference: ChatModelPreference
    ) => Promise<SetChatModelPreferenceResponse>;
    onMessageChunk: (callback: (data: ChatMessageChunkEvent) => void) => () => void;
    onThinkingStart: (callback: (data: ChatThinkingStartEvent) => void) => () => void;
    onThinkingChunk: (callback: (data: ChatThinkingChunkEvent) => void) => () => void;
    onMessageComplete: (callback: (data: ChatLifecycleEvent) => void) => () => void;
    onMessageStopped: (callback: (data: ChatLifecycleEvent) => void) => () => void;
    onMessageError: (callback: (data: ChatMessageErrorEvent) => void) => () => void;
    onRetryStatus: (callback: (status: ChatRetryStatusEvent) => void) => () => void;
    onDebugMessage: (callback: (data: ChatDebugMessageEvent) => void) => () => void;
    onToolUseStart: (callback: (tool: ChatToolUseStartEvent) => void) => () => void;
    onToolInputDelta: (callback: (data: ChatToolInputDeltaEvent) => void) => () => void;
    onContentBlockStop: (callback: (data: ChatContentBlockStopEvent) => void) => () => void;
    onToolResultStart: (callback: (data: ChatToolResultStartEvent) => void) => () => void;
    onToolResultDelta: (callback: (data: ChatToolResultDeltaEvent) => void) => () => void;
    onToolResultComplete: (callback: (data: ChatToolResultCompleteEvent) => void) => () => void;
    onSessionUpdated: (callback: (data: ChatSessionUpdatedEvent) => void) => () => void;
    onTaskProgress: (callback: (data: TaskProgressEvent) => void) => () => void;
    onTaskNotification: (callback: (data: TaskNotificationEvent) => void) => () => void;
  };
  config: {
    getWorkspaceDir: () => Promise<WorkspaceResponse>;
    setWorkspaceDir: (workspaceDir: string) => Promise<SetWorkspaceResponse>;
    getDebugMode: () => Promise<{ debugMode: boolean }>;
    setDebugMode: (debugMode: boolean) => Promise<{ success: boolean }>;
    getPathInfo: () => Promise<PathInfoResponse>;
    getEnvVars: () => Promise<EnvVarsResponse>;
    getDiagnosticMetadata: () => Promise<DiagnosticMetadataResponse>;
    getApiKeyStatus: () => Promise<{
      status: { configured: boolean; source: 'env' | 'local' | null; lastFour: string | null };
    }>;
    setApiKey: (apiKey?: string | null) => Promise<{
      success: boolean;
      status: { configured: boolean; source: 'env' | 'local' | null; lastFour: string | null };
    }>;
    getApiBaseUrl: () => Promise<{ apiBaseUrl: string | null }>;
    setApiBaseUrl: (url?: string | null) => Promise<{
      success: boolean;
      apiBaseUrl: string | null;
    }>;
    getCustomModelId: () => Promise<{ customModelId: string | null }>;
    setCustomModelId: (modelId?: string | null) => Promise<{
      success: boolean;
      customModelId: string | null;
    }>;
    getCustomModelIds: () => Promise<{ customModelIds: CustomModelIds }>;
    setCustomModelIds: (ids: CustomModelIds) => Promise<{
      success: boolean;
      customModelIds: CustomModelIds;
    }>;
    testApi: (params?: { apiKey?: string; baseUrl?: string; modelId?: string }) => Promise<{
      success: boolean;
      model?: string;
      message?: string;
      error?: string;
    }>;
    getAgentProvider: () => Promise<{ provider: AgentProvider }>;
    setAgentProvider: (provider: AgentProvider) => Promise<{
      success: boolean;
      provider: AgentProvider;
    }>;
    getOpenAIConfig: () => Promise<{
      config: OpenAIConfig;
      apiKeyConfigured: boolean;
      apiKeySource: 'env' | 'local' | null;
      apiKeyLastFour: string | null;
    }>;
    setOpenAIConfig: (config: OpenAIConfig) => Promise<{
      success: boolean;
      config: OpenAIConfig;
    }>;
    testOpenAIApi: (params?: { apiKey?: string; baseUrl?: string; modelId?: string }) => Promise<{
      success: boolean;
      model?: string;
      message?: string;
      error?: string;
    }>;
    parseApiConfig: (params: { text: string }) => Promise<ParsedApiConfig>;
    autoDetectProvider: (params: {
      apiKey: string;
      baseUrl?: string;
      modelId?: string;
    }) => Promise<AutoDetectResult>;
    recommendModels: (params: {
      models: string[];
    }) => Promise<ModelRecommendation & { error?: string }>;
  };
  shell: {
    openExternal: (url: string) => Promise<{ success: boolean; error?: string }>;
  };
  workspace: {
    listFiles: () => Promise<WorkspaceListResponse>;
    readFile: (relativePath: string) => Promise<WorkspaceReadFileResponse>;
    openFile: (relativePath: string) => Promise<{ success: boolean; error?: string }>;
    deleteFile: (
      relativePath: string,
      isDirectory: boolean
    ) => Promise<{ success: boolean; error?: string }>;
    onFilesChanged: (callback: () => void) => () => void;
  };
  app: {
    scan: () => Promise<AppScanResponse>;
    startDev: (appId: string) => Promise<AppPublishResponse>;
    stopDev: (appId: string) => Promise<{ success: boolean; error?: string }>;
    publish: (appId: string) => Promise<AppPublishResponse>;
    stop: (appId: string) => Promise<{ success: boolean; error?: string }>;
    setConversationId: (
      appId: string,
      conversationId: string
    ) => Promise<{ success: boolean; error?: string }>;
    syncConversationId: (
      conversationId: string | null
    ) => Promise<{ success: boolean; error?: string }>;
  };
  db: {
    getTables: (appId: string) => Promise<{ success: boolean; tables: string[]; error?: string }>;
    queryTable: (
      appId: string,
      table: string,
      page?: number,
      pageSize?: number
    ) => Promise<DbQueryResponse>;
    updateCell: (
      appId: string,
      table: string,
      rowId: string,
      column: string,
      value: unknown
    ) => Promise<{ success: boolean; error?: string }>;
    deleteRow: (
      appId: string,
      table: string,
      rowId: string
    ) => Promise<{ success: boolean; deleted?: boolean; error?: string }>;
    runQuery: (appId: string, sql: string) => Promise<DbQueryResponse>;
    getAppStatus: (appId: string) => Promise<{ success: boolean; status: string; error?: string }>;
  };
  skill: {
    list: () => Promise<SkillListResponse>;
    toggleShared: (
      skillName: string
    ) => Promise<{ success: boolean; shared?: boolean; error?: string }>;
    updateTags: (
      skillName: string,
      tags: string[]
    ) => Promise<{ success: boolean; error?: string }>;
    export: (
      skillName: string
    ) => Promise<{ success: boolean; filePath?: string; canceled?: boolean; error?: string }>;
    import: () => Promise<{
      success: boolean;
      manifest?: SkillManifest;
      canceled?: boolean;
      error?: string;
    }>;
    discover: () => Promise<SkillDiscoverResponse>;
    install: (
      peerInstanceId: string,
      skillName: string
    ) => Promise<{ success: boolean; manifest?: SkillManifest; error?: string }>;
    startDiscovery: () => Promise<{ success: boolean; error?: string }>;
    stopDiscovery: () => Promise<{ success: boolean; error?: string }>;
  };
  conversation: {
    list: () => Promise<ConversationListResponse>;
    create: (messages: unknown[], sessionId?: string | null) => Promise<ConversationCreateResponse>;
    get: (id: string) => Promise<ConversationGetResponse>;
    search: (query: string) => Promise<ConversationSearchResponse>;
    update: (
      id: string,
      title?: string,
      messages?: unknown[],
      sessionId?: string | null
    ) => Promise<ConversationUpdateResponse>;
    delete: (id: string) => Promise<ConversationDeleteResponse>;
    setProject: (
      conversationId: string,
      projectId: string | null
    ) => Promise<ConversationUpdateResponse>;
  };
  project: {
    list: (includeArchived?: boolean) => Promise<ProjectListResponse>;
    create: (name: string) => Promise<ProjectCreateResponse>;
    update: (
      id: string,
      updates: { name?: string; isArchived?: boolean }
    ) => Promise<ProjectUpdateResponse>;
    reorder: (orderedIds: string[]) => Promise<{ success: boolean; error?: string }>;
    delete: (id: string) => Promise<{ success: boolean; error?: string }>;
  };
  schedule: {
    list: () => Promise<ScheduleListResponse>;
    create: (data: {
      name: string;
      prompt: string;
      cronExpression: string;
      modelPreference: ChatModelPreference;
    }) => Promise<ScheduleTaskResponse>;
    update: (
      id: string,
      updates: {
        name?: string;
        prompt?: string;
        cronExpression?: string;
        enabled?: boolean;
        modelPreference?: ChatModelPreference;
      }
    ) => Promise<ScheduleTaskResponse>;
    delete: (id: string) => Promise<{ success: boolean; error?: string }>;
    runNow: (id: string) => Promise<ScheduleRunResponse>;
  };
  analytics: {
    trackEvent: (event: AnalyticsEvent) => Promise<void>;
    submitFeedback: (feedback: MessageFeedback) => Promise<void>;
    getSettings: () => Promise<AnalyticsSettings>;
    setSettings: (settings: Partial<AnalyticsSettings>) => Promise<AnalyticsSettings>;
  };
  canvas: {
    loadFile: (filePath: string) => Promise<{
      success: boolean;
      elements?: SimpleElement[];
      error?: string;
    }>;
    saveFile: (filePath: string, content: string) => Promise<{
      success: boolean;
      error?: string;
    }>;
    createFile: (filePath: string) => Promise<{
      success: boolean;
      error?: string;
    }>;
    updateState: (filePath: string, elements: SimpleElement[]) => Promise<{
      success: boolean;
    }>;
    getState: (filePath: string) => Promise<{
      success: boolean;
      elements?: SimpleElement[];
      error?: string;
    }>;
    applySdkResult: (filePath: string, intermediateElementsJson: string) => Promise<{
      success: boolean;
      error?: string;
    }>;
    screenshot: (filePath: string, outputPath: string) => Promise<{
      success: boolean;
      path?: string;
      error?: string;
    }>;
    onElementsUpdated: (
      callback: (data: { filePath: string; intermediateElements: unknown[] }) => void
    ) => () => void;
    onScreenshotRequest: (
      callback: (data: { filePath: string; outputPath: string }) => void
    ) => () => void;
    sendScreenshotResult: (result: {
      success: boolean;
      path?: string;
      error?: string;
    }) => void;
  };
  update: {
    getStatus: () => Promise<UpdateStatus>;
    check: () => Promise<{ success: boolean }>;
    install: () => Promise<{ success: boolean }>;
    getChannel: () => Promise<{ channel: UpdateChannel }>;
    setChannel: (channel: UpdateChannel) => Promise<{ success: boolean; channel: UpdateChannel }>;
    onStatusChanged: (callback: (status: UpdateStatus) => void) => () => void;
  };
}

declare global {
  interface Window {
    electron: ElectronAPI;
  }
}
