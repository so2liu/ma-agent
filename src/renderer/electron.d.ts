import type {
  ChatModelPreference,
  GetChatModelPreferenceResponse,
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

export type AppStatus =
  | 'stopped'
  | 'scaffolding'
  | 'installing'
  | 'developing'
  | 'building'
  | 'running';

export interface AppInfo {
  id: string;
  name: string;
  description: string;
  icon: string;
  status: AppStatus;
  lanUrl: string | null;
  localUrl: string | null;
  port: number | null;
  isViteApp: boolean;
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

export interface Project {
  id: string;
  name: string;
  order: number;
  isArchived: boolean;
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
  conversations?: Conversation[];
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
    stopMessage: () => Promise<{ success: boolean; error?: string }>;
    resetSession: (
      resumeSessionId?: string | null
    ) => Promise<{ success: boolean; error?: string }>;
    getModelPreference: () => Promise<GetChatModelPreferenceResponse>;
    setModelPreference: (
      preference: ChatModelPreference
    ) => Promise<SetChatModelPreferenceResponse>;
    onMessageChunk: (callback: (chunk: string) => void) => () => void;
    onThinkingStart: (callback: (data: ThinkingStart) => void) => () => void;
    onThinkingChunk: (callback: (data: ThinkingChunk) => void) => () => void;
    onMessageComplete: (callback: () => void) => () => void;
    onMessageStopped: (callback: () => void) => () => void;
    onMessageError: (callback: (error: string) => void) => () => void;
    onDebugMessage: (callback: (message: string) => void) => () => void;
    onToolUseStart: (callback: (tool: ToolUse) => void) => () => void;
    onToolInputDelta: (callback: (data: ToolInputDelta) => void) => () => void;
    onContentBlockStop: (callback: (data: ContentBlockStop) => void) => () => void;
    onToolResultStart: (callback: (data: ToolResultStart) => void) => () => void;
    onToolResultDelta: (callback: (data: ToolResultDelta) => void) => () => void;
    onToolResultComplete: (callback: (data: ToolResultComplete) => void) => () => void;
    onSessionUpdated: (
      callback: (data: { sessionId: string; resumed: boolean }) => void
    ) => () => void;
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
  };
  skill: {
    list: () => Promise<SkillListResponse>;
    toggleShared: (skillName: string) => Promise<{ success: boolean; shared?: boolean; error?: string }>;
    updateTags: (skillName: string, tags: string[]) => Promise<{ success: boolean; error?: string }>;
    export: (skillName: string) => Promise<{ success: boolean; filePath?: string; canceled?: boolean; error?: string }>;
    import: () => Promise<{ success: boolean; manifest?: SkillManifest; canceled?: boolean; error?: string }>;
    discover: () => Promise<SkillDiscoverResponse>;
    install: (peerInstanceId: string, skillName: string) => Promise<{ success: boolean; manifest?: SkillManifest; error?: string }>;
    startDiscovery: () => Promise<{ success: boolean; error?: string }>;
    stopDiscovery: () => Promise<{ success: boolean; error?: string }>;
  };
  conversation: {
    list: () => Promise<ConversationListResponse>;
    create: (messages: unknown[], sessionId?: string | null) => Promise<ConversationCreateResponse>;
    get: (id: string) => Promise<ConversationGetResponse>;
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
  update: {
    getStatus: () => Promise<UpdateStatus>;
    check: () => Promise<{ success: boolean }>;
    download: () => Promise<{ success: boolean }>;
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
