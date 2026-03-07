import { contextBridge, ipcRenderer } from 'electron';

import type { ChatModelPreference, SendMessagePayload } from '../shared/types/ipc';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electron', {
  onNavigate: (callback: (view: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, view: string) => callback(view);
    ipcRenderer.on('navigate', listener);
    return () => ipcRenderer.removeListener('navigate', listener);
  },
  chat: {
    sendMessage: (payload: SendMessagePayload) => ipcRenderer.invoke('chat:send-message', payload),
    stopMessage: () => ipcRenderer.invoke('chat:stop-message'),
    resetSession: (resumeSessionId?: string | null) =>
      ipcRenderer.invoke('chat:reset-session', resumeSessionId),
    getModelPreference: () => ipcRenderer.invoke('chat:get-model-preference'),
    setModelPreference: (preference: ChatModelPreference) =>
      ipcRenderer.invoke('chat:set-model-preference', preference),
    onMessageChunk: (callback: (chunk: string) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, chunk: string) => callback(chunk);
      ipcRenderer.on('chat:message-chunk', listener);
      return () => ipcRenderer.removeListener('chat:message-chunk', listener);
    },
    onThinkingStart: (callback: (data: { index: number }) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, data: { index: number }) =>
        callback(data);
      ipcRenderer.on('chat:thinking-start', listener);
      return () => ipcRenderer.removeListener('chat:thinking-start', listener);
    },
    onThinkingChunk: (callback: (data: { index: number; delta: string }) => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        data: { index: number; delta: string }
      ) => callback(data);
      ipcRenderer.on('chat:thinking-chunk', listener);
      return () => ipcRenderer.removeListener('chat:thinking-chunk', listener);
    },
    onMessageComplete: (callback: () => void) => {
      const listener = () => callback();
      ipcRenderer.on('chat:message-complete', listener);
      return () => ipcRenderer.removeListener('chat:message-complete', listener);
    },
    onMessageStopped: (callback: () => void) => {
      const listener = () => callback();
      ipcRenderer.on('chat:message-stopped', listener);
      return () => ipcRenderer.removeListener('chat:message-stopped', listener);
    },
    onMessageError: (callback: (error: string) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, error: string) => callback(error);
      ipcRenderer.on('chat:message-error', listener);
      return () => ipcRenderer.removeListener('chat:message-error', listener);
    },
    onDebugMessage: (callback: (message: string) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, message: string) => callback(message);
      ipcRenderer.on('chat:debug-message', listener);
      return () => ipcRenderer.removeListener('chat:debug-message', listener);
    },
    onToolUseStart: (
      callback: (tool: {
        id: string;
        name: string;
        input: Record<string, unknown>;
        streamIndex: number;
      }) => void
    ) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        tool: { id: string; name: string; input: Record<string, unknown>; streamIndex: number }
      ) => callback(tool);
      ipcRenderer.on('chat:tool-use-start', listener);
      return () => ipcRenderer.removeListener('chat:tool-use-start', listener);
    },
    onToolInputDelta: (callback: (data: { index: number; delta: string }) => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        data: { index: number; delta: string }
      ) => callback(data);
      ipcRenderer.on('chat:tool-input-delta', listener);
      return () => ipcRenderer.removeListener('chat:tool-input-delta', listener);
    },
    onContentBlockStop: (callback: (data: { index: number }) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, data: { index: number }) =>
        callback(data);
      ipcRenderer.on('chat:content-block-stop', listener);
      return () => ipcRenderer.removeListener('chat:content-block-stop', listener);
    },
    onToolResultStart: (
      callback: (data: { toolUseId: string; content: string; isError: boolean }) => void
    ) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        data: { toolUseId: string; content: string; isError: boolean }
      ) => callback(data);
      ipcRenderer.on('chat:tool-result-start', listener);
      return () => ipcRenderer.removeListener('chat:tool-result-start', listener);
    },
    onToolResultDelta: (callback: (data: { toolUseId: string; delta: string }) => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        data: { toolUseId: string; delta: string }
      ) => callback(data);
      ipcRenderer.on('chat:tool-result-delta', listener);
      return () => ipcRenderer.removeListener('chat:tool-result-delta', listener);
    },
    onToolResultComplete: (
      callback: (data: { toolUseId: string; content: string; isError?: boolean }) => void
    ) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        data: { toolUseId: string; content: string; isError?: boolean }
      ) => callback(data);
      ipcRenderer.on('chat:tool-result-complete', listener);
      return () => ipcRenderer.removeListener('chat:tool-result-complete', listener);
    },
    onSessionUpdated: (callback: (data: { sessionId: string; resumed: boolean }) => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        data: { sessionId: string; resumed: boolean }
      ) => callback(data);
      ipcRenderer.on('chat:session-updated', listener);
      return () => ipcRenderer.removeListener('chat:session-updated', listener);
    }
  },
  config: {
    getWorkspaceDir: () => ipcRenderer.invoke('config:get-workspace-dir'),
    setWorkspaceDir: (workspaceDir: string) =>
      ipcRenderer.invoke('config:set-workspace-dir', workspaceDir),
    getDebugMode: () => ipcRenderer.invoke('config:get-debug-mode'),
    setDebugMode: (debugMode: boolean) => ipcRenderer.invoke('config:set-debug-mode', debugMode),
    getPathInfo: () => ipcRenderer.invoke('config:get-path-info'),
    getEnvVars: () => ipcRenderer.invoke('config:get-env-vars'),
    getDiagnosticMetadata: () => ipcRenderer.invoke('config:get-diagnostic-metadata'),
    getApiKeyStatus: () => ipcRenderer.invoke('config:get-api-key-status'),
    setApiKey: (apiKey?: string | null) => ipcRenderer.invoke('config:set-api-key', apiKey),
    getApiBaseUrl: () => ipcRenderer.invoke('config:get-api-base-url'),
    setApiBaseUrl: (url?: string | null) => ipcRenderer.invoke('config:set-api-base-url', url)
  },
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url)
  },
  conversation: {
    list: () => ipcRenderer.invoke('conversation:list'),
    create: (messages: unknown[], sessionId?: string | null) =>
      ipcRenderer.invoke('conversation:create', messages, sessionId),
    get: (id: string) => ipcRenderer.invoke('conversation:get', id),
    update: (id: string, title?: string, messages?: unknown[], sessionId?: string | null) =>
      ipcRenderer.invoke('conversation:update', id, title, messages, sessionId),
    delete: (id: string) => ipcRenderer.invoke('conversation:delete', id),
    setProject: (conversationId: string, projectId: string | null) =>
      ipcRenderer.invoke('conversation:set-project', conversationId, projectId),
  },
  project: {
    list: (includeArchived?: boolean) => ipcRenderer.invoke('project:list', includeArchived),
    create: (name: string) => ipcRenderer.invoke('project:create', name),
    update: (id: string, updates: { name?: string; isArchived?: boolean }) =>
      ipcRenderer.invoke('project:update', id, updates),
    reorder: (orderedIds: string[]) => ipcRenderer.invoke('project:reorder', orderedIds),
    delete: (id: string) => ipcRenderer.invoke('project:delete', id),
  },
  workspace: {
    listFiles: () => ipcRenderer.invoke('workspace:list-files'),
    readFile: (relativePath: string) => ipcRenderer.invoke('workspace:read-file', relativePath),
    openFile: (relativePath: string) => ipcRenderer.invoke('workspace:open-file', relativePath),
    deleteFile: (relativePath: string, isDirectory: boolean) =>
      ipcRenderer.invoke('workspace:delete-file', relativePath, isDirectory),
    onFilesChanged: (callback: () => void) => {
      const listener = () => callback();
      ipcRenderer.on('workspace:files-changed', listener);
      return () => ipcRenderer.removeListener('workspace:files-changed', listener);
    }
  },
  app: {
    scan: () => ipcRenderer.invoke('app:scan'),
    startDev: (appId: string) => ipcRenderer.invoke('app:start-dev', appId),
    stopDev: (appId: string) => ipcRenderer.invoke('app:stop-dev', appId),
    publish: (appId: string) => ipcRenderer.invoke('app:publish', appId),
    stop: (appId: string) => ipcRenderer.invoke('app:stop', appId)
  },
  db: {
    getTables: (appId: string) => ipcRenderer.invoke('db:get-tables', appId),
    queryTable: (appId: string, table: string, page?: number, pageSize?: number) =>
      ipcRenderer.invoke('db:query-table', appId, table, page, pageSize),
    updateCell: (appId: string, table: string, rowId: string, column: string, value: unknown) =>
      ipcRenderer.invoke('db:update-cell', appId, table, rowId, column, value),
    deleteRow: (appId: string, table: string, rowId: string) =>
      ipcRenderer.invoke('db:delete-row', appId, table, rowId),
    runQuery: (appId: string, sql: string) => ipcRenderer.invoke('db:run-query', appId, sql),
    getAppStatus: (appId: string) => ipcRenderer.invoke('db:get-app-status', appId)
  },
  skill: {
    list: () => ipcRenderer.invoke('skill:list'),
    toggleShared: (skillName: string) => ipcRenderer.invoke('skill:toggle-shared', skillName),
    updateTags: (skillName: string, tags: string[]) =>
      ipcRenderer.invoke('skill:update-tags', skillName, tags),
    export: (skillName: string) => ipcRenderer.invoke('skill:export', skillName),
    import: () => ipcRenderer.invoke('skill:import'),
    discover: () => ipcRenderer.invoke('skill:discover'),
    install: (peerInstanceId: string, skillName: string) =>
      ipcRenderer.invoke('skill:install', peerInstanceId, skillName),
    startDiscovery: () => ipcRenderer.invoke('skill:start-discovery'),
    stopDiscovery: () => ipcRenderer.invoke('skill:stop-discovery')
  },
  update: {
    getStatus: () => ipcRenderer.invoke('update:get-status'),
    check: () => ipcRenderer.invoke('update:check'),
    download: () => ipcRenderer.invoke('update:download'),
    install: () => ipcRenderer.invoke('update:install'),
    getChannel: () => ipcRenderer.invoke('update:get-channel'),
    setChannel: (channel: 'stable' | 'nightly') =>
      ipcRenderer.invoke('update:set-channel', channel),
    onStatusChanged: (
      callback: (status: {
        checking: boolean;
        updateAvailable: boolean;
        downloading: boolean;
        downloadProgress: number;
        readyToInstall: boolean;
        error: string | null;
        updateInfo: {
          version: string;
          releaseDate: string;
          releaseNotes?: string;
        } | null;
        lastCheckComplete: boolean;
        updateChannel: 'stable' | 'nightly';
      }) => void
    ) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        status: {
          checking: boolean;
          updateAvailable: boolean;
          downloading: boolean;
          downloadProgress: number;
          readyToInstall: boolean;
          error: string | null;
          updateInfo: {
            version: string;
            releaseDate: string;
            releaseNotes?: string;
          } | null;
          lastCheckComplete: boolean;
          updateChannel: 'stable' | 'nightly';
        }
      ) => callback(status);
      ipcRenderer.on('update:status-changed', listener);
      return () => ipcRenderer.removeListener('update:status-changed', listener);
    }
  }
});
