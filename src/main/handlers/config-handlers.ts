import { existsSync, readFileSync } from 'fs';
import { createRequire } from 'module';
import { release, type, version } from 'os';
import { app, ipcMain } from 'electron';

import Anthropic, {
  APIConnectionError,
  APIConnectionTimeoutError,
  AuthenticationError,
  NotFoundError,
  PermissionDeniedError,
  RateLimitError
} from '@anthropic-ai/sdk';

import {
  buildClaudeSessionEnv,
  buildEnhancedPath,
  ensureWorkspaceDir,
  getApiBaseUrl,
  getApiKey,
  getApiKeyStatus,
  getCustomModelId,
  getDebugMode,
  getWorkspaceDir,
  loadConfig,
  saveConfig,
  setApiBaseUrl,
  setApiKey,
  setCustomModelId
} from '../lib/config';
import { getCurrentModelPreference, MODEL_BY_PREFERENCE } from '../lib/claude-session';
import { restartFileWatcher } from './workspace-handlers';

const requireModule = createRequire(import.meta.url);

function getClaudeAgentSdkVersion(): string {
  try {
    // Try to resolve the SDK package.json
    const sdkPackagePath = requireModule.resolve('@anthropic-ai/claude-agent-sdk/package.json');

    // Handle app.asar unpacked case (production builds)
    let packagePath = sdkPackagePath;
    if (sdkPackagePath.includes('app.asar')) {
      const unpackedPath = sdkPackagePath.replace('app.asar', 'app.asar.unpacked');
      if (existsSync(unpackedPath)) {
        packagePath = unpackedPath;
      }
    }

    if (existsSync(packagePath)) {
      const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8'));
      return packageJson.version || 'unknown';
    }
  } catch {
    // Fallback if we can't read the version
  }
  return 'unknown';
}

export function registerConfigHandlers(): void {
  // Get workspace directory
  ipcMain.handle('config:get-workspace-dir', () => {
    return { workspaceDir: getWorkspaceDir() };
  });

  // Set workspace directory
  ipcMain.handle('config:set-workspace-dir', async (_event, workspaceDir: string) => {
    const trimmedPath = workspaceDir.trim();
    if (!trimmedPath) {
      return { success: false, error: 'Workspace directory cannot be empty' };
    }

    const config = loadConfig();
    config.workspaceDir = trimmedPath;
    saveConfig(config);

    // Create the new workspace directory and restart file watcher
    await ensureWorkspaceDir();
    restartFileWatcher();

    return { success: true };
  });

  // Get debug mode
  ipcMain.handle('config:get-debug-mode', () => {
    return { debugMode: getDebugMode() };
  });

  // Set debug mode
  ipcMain.handle('config:set-debug-mode', (_event, debugMode: boolean) => {
    const config = loadConfig();
    config.debugMode = debugMode;
    saveConfig(config);
    return { success: true };
  });

  // API key status (env vs local config)
  ipcMain.handle('config:get-api-key-status', () => {
    return { status: getApiKeyStatus() };
  });

  // Set or clear API key stored in app config
  ipcMain.handle('config:set-api-key', (_event, apiKey?: string | null) => {
    const normalized = apiKey?.trim() || null;
    setApiKey(normalized);
    return { success: true, status: getApiKeyStatus() };
  });

  // Get API base URL
  ipcMain.handle('config:get-api-base-url', () => {
    return { apiBaseUrl: getApiBaseUrl() };
  });

  // Set API base URL
  ipcMain.handle('config:set-api-base-url', (_event, url?: string | null) => {
    const normalized = url?.trim() || null;
    setApiBaseUrl(normalized);
    return { success: true, apiBaseUrl: getApiBaseUrl() };
  });

  // Get PATH environment variable info (for debug/dev section)
  // Uses the enhanced PATH (same as Claude Agent SDK) for consistency
  ipcMain.handle('config:get-path-info', () => {
    const pathSeparator = process.platform === 'win32' ? ';' : ':';
    // Use enhanced PATH to match what Claude Agent SDK uses
    const enhancedPath = buildEnhancedPath();
    const pathEntries = enhancedPath.split(pathSeparator).filter((p) => p.trim());
    return {
      platform: process.platform,
      pathSeparator,
      pathEntries,
      pathCount: pathEntries.length,
      fullPath: enhancedPath
    };
  });

  // Get all environment variables (for debug/dev section)
  // Uses the same environment object as Claude Agent SDK query sessions for consistency
  // Masks sensitive variables like API keys, passwords, tokens, etc.
  ipcMain.handle('config:get-env-vars', () => {
    const sensitivePatterns = [
      /KEY/i,
      /SECRET/i,
      /PASSWORD/i,
      /TOKEN/i,
      /AUTH/i,
      /CREDENTIAL/i,
      /PRIVATE/i
    ];

    const maskValue = (key: string, value: string): string => {
      // Check if key matches any sensitive pattern
      const isSensitive = sensitivePatterns.some((pattern) => pattern.test(key));
      if (!isSensitive) {
        return value;
      }

      // Mask sensitive values
      if (value.length <= 8) {
        return '••••';
      }
      // Show first 4 and last 4 chars for longer values
      return `${value.slice(0, 4)}••••${value.slice(-4)}`;
    };

    // Use the same environment builder as Claude Agent SDK to ensure consistency
    const env = buildClaudeSessionEnv();

    const envVars: Array<{ key: string; value: string }> = [];
    for (const [key, value] of Object.entries(env)) {
      if (value !== undefined) {
        envVars.push({
          key,
          value: maskValue(key, value)
        });
      }
    }

    // Sort alphabetically by key
    envVars.sort((a, b) => a.key.localeCompare(b.key));

    return { envVars, count: envVars.length };
  });

  // Get custom model ID
  ipcMain.handle('config:get-custom-model-id', () => {
    return { customModelId: getCustomModelId() };
  });

  // Set custom model ID
  ipcMain.handle('config:set-custom-model-id', (_event, modelId?: string | null) => {
    const normalized = modelId?.trim() || null;
    setCustomModelId(normalized);
    return { success: true, customModelId: getCustomModelId() };
  });

  // Test API connection using form values (not persisted config)
  ipcMain.handle(
    'config:test-api',
    async (
      _event,
      params?: { apiKey?: string; baseUrl?: string; modelId?: string }
    ) => {
      // Use form values if provided, fall back to persisted config
      const apiKey = params?.apiKey?.trim() || getApiKey();
      if (!apiKey) {
        return { success: false, error: '请先配置 API Key' };
      }

      const baseURL = params?.baseUrl?.trim() || getApiBaseUrl();
      const customModel = params?.modelId?.trim() || getCustomModelId();
      const modelId =
        customModel ||
        MODEL_BY_PREFERENCE[getCurrentModelPreference()] ||
        'claude-haiku-4-5-20251001';
      const isCustomModel = Boolean(customModel);

      try {
        const client = new Anthropic({
          apiKey,
          ...(baseURL ? { baseURL } : {})
        });

        const response = await client.messages.create({
          model: modelId,
          max_tokens: 16,
          messages: [{ role: 'user', content: 'Hi' }]
        });

        return {
          success: true,
          model: response.model,
          message: isCustomModel ? `连接成功 (自定义模型)` : '连接成功，API 可用'
        };
      } catch (err: unknown) {
        // Use SDK error classes for reliable detection
        if (err instanceof AuthenticationError) {
          return { success: false, error: 'API Key 无效或已过期，请检查后重试' };
        }
        if (err instanceof PermissionDeniedError) {
          return { success: false, error: '没有访问权限，请检查 API Key 的权限设置' };
        }
        if (err instanceof NotFoundError) {
          return {
            success: false,
            error: `找不到模型 "${modelId}"，请检查模型 ID 或 API 地址是否正确`
          };
        }
        if (err instanceof RateLimitError) {
          return { success: false, error: '请求过于频繁，请稍后再试' };
        }
        if (err instanceof APIConnectionTimeoutError) {
          return {
            success: false,
            error: `连接超时${baseURL ? ` (${baseURL})` : ''}，请检查网络连接或 API 地址`
          };
        }
        if (err instanceof APIConnectionError) {
          return {
            success: false,
            error: `无法连接到 API 服务器${baseURL ? ` (${baseURL})` : ''}，请检查网络连接或 API 地址`
          };
        }

        // Fallback: check status code for Anthropic API errors
        if (err instanceof Anthropic.APIError) {
          const status = err.status;
          if (status >= 500) {
            return { success: false, error: 'API 服务暂时不可用，请稍后再试' };
          }
        }

        const message = err instanceof Error ? err.message : String(err);
        return { success: false, error: `连接失败: ${message}` };
      }
    }
  );

  // Get app diagnostic metadata (versions, platform info, etc.)
  ipcMain.handle('config:get-diagnostic-metadata', () => {
    return {
      appVersion: app.getVersion(),
      electronVersion: process.versions.electron,
      chromiumVersion: process.versions.chrome,
      v8Version: process.versions.v8,
      nodeVersion: process.versions.node,
      claudeAgentSdkVersion: getClaudeAgentSdkVersion(),
      platform: process.platform,
      arch: process.arch,
      osRelease: release(),
      osType: type(),
      osVersion: version()
    };
  });
}
