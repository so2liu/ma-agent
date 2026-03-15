import { existsSync, readFileSync } from 'fs';
import { createRequire } from 'module';
import { release, type, version } from 'os';
import Anthropic, {
  APIConnectionError,
  APIConnectionTimeoutError,
  AuthenticationError,
  NotFoundError,
  PermissionDeniedError,
  RateLimitError
} from '@anthropic-ai/sdk';
import { app, ipcMain } from 'electron';

import type {
  AgentProvider,
  CustomModelIds,
  LlmProvider,
  OpenAIConfig,
  ProbeDetail
} from '../../shared/types/ipc';
import { getModelIdForPreference } from '../lib/claude-session';
import {
  buildClaudeSessionEnv,
  buildEnhancedPath,
  ensureWorkspaceDir,
  getAgentProvider,
  getApiBaseUrl,
  getApiKey,
  getApiKeyStatus,
  getCustomModelId,
  getCustomModelIds,
  getDebugMode,
  getOpenAIApiKey,
  getOpenAIConfig,
  getWorkspaceDir,
  loadConfig,
  saveConfig,
  setAgentProvider,
  setApiBaseUrl,
  setApiKey,
  setCustomModelId,
  setCustomModelIds,
  setOpenAIConfig
} from '../lib/config';
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

  // Get per-tier custom model IDs
  ipcMain.handle('config:get-custom-model-ids', () => {
    return { customModelIds: getCustomModelIds() };
  });

  // Set per-tier custom model IDs
  ipcMain.handle('config:set-custom-model-ids', (_event, ids: CustomModelIds) => {
    setCustomModelIds(ids);
    return { success: true, customModelIds: getCustomModelIds() };
  });

  // Test API connection using form values (not persisted config)
  ipcMain.handle(
    'config:test-api',
    async (_event, params?: { apiKey?: string; baseUrl?: string; modelId?: string }) => {
      // Use form values if provided, fall back to persisted config
      const apiKey = params?.apiKey?.trim() || getApiKey();
      if (!apiKey) {
        return { success: false, error: '请先配置 API Key' };
      }

      const baseURL = params?.baseUrl?.trim() || getApiBaseUrl();
      const explicitModel = params?.modelId?.trim();
      const modelId = explicitModel || getModelIdForPreference();
      const isCustomModel = Boolean(explicitModel);

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

  // Get active agent provider
  ipcMain.handle('config:get-agent-provider', () => {
    return { provider: getAgentProvider() };
  });

  // Set active agent provider
  ipcMain.handle('config:set-agent-provider', (_event, provider: AgentProvider) => {
    setAgentProvider(provider);
    return { success: true, provider: getAgentProvider() };
  });

  // Get OpenAI configuration
  ipcMain.handle('config:get-openai-config', () => {
    const config = getOpenAIConfig();
    // Don't expose the full API key
    const apiKey = getOpenAIApiKey();
    return {
      config: {
        ...config,
        apiKey: undefined // Don't send the key itself
      },
      apiKeyConfigured: Boolean(apiKey),
      apiKeySource:
        process.env.OPENAI_API_KEY?.trim() ? 'env'
        : apiKey ? 'local'
        : null,
      apiKeyLastFour: apiKey ? apiKey.slice(-4) : null
    };
  });

  // Set OpenAI configuration
  ipcMain.handle('config:set-openai-config', (_event, openaiConfig: OpenAIConfig) => {
    setOpenAIConfig(openaiConfig);
    return { success: true, config: getOpenAIConfig() };
  });

  // Test OpenAI API connection
  ipcMain.handle(
    'config:test-openai-api',
    async (_event, params?: { apiKey?: string; baseUrl?: string; modelId?: string }) => {
      const apiKey = params?.apiKey?.trim() || getOpenAIApiKey();
      if (!apiKey) {
        return { success: false, error: '请先配置 OpenAI API Key' };
      }

      const baseUrl = params?.baseUrl?.trim() || getOpenAIConfig().baseUrl;
      const modelId = params?.modelId?.trim() || getOpenAIConfig().modelId || 'gpt-4.1-mini';

      try {
        // Simple chat completion test using fetch (avoid adding openai npm dependency)
        const url = `${baseUrl || 'https://api.openai.com'}/v1/chat/completions`;
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: modelId,
            max_tokens: 16,
            messages: [{ role: 'user', content: 'Hi' }]
          })
        });

        if (!response.ok) {
          const status = response.status;
          if (status === 401) {
            return { success: false, error: 'OpenAI API Key 无效或已过期' };
          }
          if (status === 403) {
            return { success: false, error: '没有访问权限，请检查 API Key 的权限设置' };
          }
          if (status === 404) {
            return {
              success: false,
              error: `找不到模型 "${modelId}"，请检查模型 ID 或 API 地址`
            };
          }
          if (status === 429) {
            return { success: false, error: '请求过于频繁，请稍后再试' };
          }
          if (status >= 500) {
            return { success: false, error: 'API 服务暂时不可用，请稍后再试' };
          }
          const body = await response.text().catch(() => '');
          return { success: false, error: `连接失败 (${status}): ${body.slice(0, 200)}` };
        }

        const data = await response.json();
        return {
          success: true,
          model: data.model || modelId,
          message: '连接成功，OpenAI API 可用'
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes('ECONNREFUSED') || message.includes('ETIMEDOUT')) {
          return {
            success: false,
            error: `无法连接到 API 服务器${baseUrl ? ` (${baseUrl})` : ''}，请检查网络连接或 API 地址`
          };
        }
        return { success: false, error: `连接失败: ${message}` };
      }
    }
  );

  // Build-time default from electron.vite.config.ts, runtime env var overrides
  const PARSE_SERVER_URL: string = process.env.PARSE_SERVER_URL || __PARSE_SERVER_URL__;
  const HMAC_SECRET = __HMAC_SECRET__;

  async function signRequest(body: string): Promise<{ timestamp: string; signature: string }> {
    const timestamp = String(Date.now());
    const message = `${timestamp}.${body}`;
    const key = await globalThis.crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(HMAC_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const sig = await globalThis.crypto.subtle.sign(
      'HMAC',
      key,
      new TextEncoder().encode(message)
    );
    const signature = Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    return { timestamp, signature };
  }

  // Extract API keys locally via regex before sending text to server
  // This prevents leaking third-party API keys to our parse service
  const API_KEY_PATTERNS = [
    /\b(sk-[a-zA-Z0-9_-]{20,})\b/g, // OpenAI, Anthropic, DeepSeek etc.
    /\b(key-[a-zA-Z0-9_-]{20,})\b/g,
    /\b([a-f0-9]{32,})\b/g // hex keys (e.g. some providers)
  ];

  function extractApiKeysLocally(
    text: string
  ): { apiKey: string | undefined; sanitizedText: string } {
    let apiKey: string | undefined;
    let sanitizedText = text;
    for (const pattern of API_KEY_PATTERNS) {
      const match = pattern.exec(text);
      if (match && !apiKey) {
        apiKey = match[1];
      }
      // Reset lastIndex for global regex
      pattern.lastIndex = 0;
      // Replace all matches with placeholder so they never leave the client
      sanitizedText = sanitizedText.replace(pattern, '[REDACTED]');
    }
    return { apiKey, sanitizedText };
  }

  // Parse API config from text via server-side NLP
  // API keys are extracted locally and never sent to the server
  ipcMain.handle('config:parse-api-config', async (_event, params: { text: string }) => {
    // Step 1: Extract API key locally
    const { apiKey, sanitizedText } = extractApiKeysLocally(params.text);

    let serverDetail: { success: boolean; baseUrl?: string; modelId?: string; error?: string };

    try {
      // Step 2: Send sanitized text (no secrets) to server for baseUrl/modelId extraction
      const requestBody = JSON.stringify({ text: sanitizedText });
      const { timestamp, signature } = await signRequest(requestBody);
      const response = await fetch(`${PARSE_SERVER_URL}/api/parse-config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-App-Timestamp': timestamp,
          'X-App-Signature': signature
        },
        body: requestBody,
        signal: AbortSignal.timeout(15_000)
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body) {
        serverDetail = {
          success: false,
          error: body?.error || `HTTP ${response.status}`
        };
      } else if (body.error && !body.baseUrl && !body.modelId) {
        serverDetail = { success: false, error: body.error };
      } else {
        serverDetail = {
          success: true,
          ...(body.baseUrl ? { baseUrl: body.baseUrl } : {}),
          ...(body.modelId ? { modelId: body.modelId } : {})
        };
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      serverDetail = {
        success: false,
        error:
          message.includes('AbortError') || message.includes('timeout')
            ? '响应超时'
            : message
      };
    }

    // Merge locally-extracted apiKey with server-extracted baseUrl/modelId
    const result = {
      ...(apiKey ? { apiKey } : {}),
      ...(serverDetail.baseUrl ? { baseUrl: serverDetail.baseUrl } : {}),
      ...(serverDetail.modelId ? { modelId: serverDetail.modelId } : {}),
      serverDetail
    };

    // If nothing useful was extracted at all, return an error
    if (!apiKey && !serverDetail.baseUrl && !serverDetail.modelId) {
      return {
        ...result,
        error: serverDetail.error || 'no_valid_info'
      };
    }

    return result;
  });

  // Normalize baseUrl: strip known API path suffixes so probes don't build malformed URLs
  function normalizeBaseUrl(url: string): string {
    return url.replace(/\/v1\/(chat\/completions|completions|models|messages)\/?$/i, '');
  }

  // Auto-detect LLM protocol by probing both Anthropic and OpenAI endpoints
  ipcMain.handle(
    'config:auto-detect-provider',
    async (
      _event,
      params: { apiKey: string; baseUrl?: string; modelId?: string }
    ) => {
      const { apiKey, modelId } = params;
      const baseUrl = params.baseUrl ? normalizeBaseUrl(params.baseUrl) : undefined;

      if (!apiKey) {
        return { success: false, error: '未找到 API Key' };
      }

      // Determine probe order based on URL hints
      const url = baseUrl?.toLowerCase() || '';
      const tryAnthropicFirst = url.includes('anthropic');

      const probeOpenAI = async (): Promise<{
        success: boolean;
        model?: string;
        error?: string;
        availableModels?: string[];
        modelCount?: number;
      }> => {
        try {
          const base = baseUrl || 'https://api.openai.com';

          // If no modelId, try GET /v1/models first (lighter, doesn't require a specific model)
          if (!modelId) {
            const modelsResp = await fetch(`${base}/v1/models`, {
              headers: { Authorization: `Bearer ${apiKey}` },
              signal: AbortSignal.timeout(10_000)
            });
            if (modelsResp.ok) {
              const data = await modelsResp.json();
              const modelIds: string[] =
                (data.data as Array<{ id: string }>)?.map((m) => m.id) || [];
              return {
                success: true,
                modelCount: modelIds.length,
                availableModels: modelIds
              };
            }
          }

          // If modelId provided, or /v1/models failed, try a completion
          const endpoint = `${base}/v1/chat/completions`;
          const resp = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`
            },
            body: JSON.stringify({
              model: modelId || 'gpt-4.1-mini',
              max_tokens: 16,
              messages: [{ role: 'user', content: 'Hi' }]
            }),
            signal: AbortSignal.timeout(15_000)
          });
          if (resp.ok) {
            const data = await resp.json();
            return { success: true, model: data.model };
          }
          return { success: false, error: `HTTP ${resp.status}` };
        } catch (err: unknown) {
          return {
            success: false,
            error: err instanceof Error ? err.message : String(err)
          };
        }
      };

      const probeAnthropic = async (): Promise<{
        success: boolean;
        model?: string;
        error?: string;
        availableModels?: string[];
        modelCount?: number;
      }> => {
        try {
          const client = new Anthropic({
            apiKey,
            ...(baseUrl ? { baseURL: baseUrl } : {})
          });
          const resp = await client.messages.create({
            model: modelId || 'claude-haiku-4-5-20251001',
            max_tokens: 16,
            messages: [{ role: 'user', content: 'Hi' }]
          });
          return { success: true, model: resp.model };
        } catch (err: unknown) {
          return {
            success: false,
            error: err instanceof Error ? err.message : String(err)
          };
        }
      };

      // Try in order
      const [first, second] =
        tryAnthropicFirst ?
          [
            { probe: probeAnthropic, provider: 'anthropic' as LlmProvider },
            { probe: probeOpenAI, provider: 'openai' as LlmProvider }
          ]
        : [
            { probe: probeOpenAI, provider: 'openai' as LlmProvider },
            { probe: probeAnthropic, provider: 'anthropic' as LlmProvider }
          ];

      const probes: ProbeDetail[] = [];

      const firstResult = await first.probe();
      probes.push({
        provider: first.provider,
        success: firstResult.success,
        model: firstResult.model,
        error: firstResult.error,
        modelCount: firstResult.modelCount
      });
      if (firstResult.success) {
        return {
          success: true,
          provider: first.provider,
          model: firstResult.model,
          probes,
          availableModels: firstResult.availableModels
        };
      }

      const secondResult = await second.probe();
      probes.push({
        provider: second.provider,
        success: secondResult.success,
        model: secondResult.model,
        error: secondResult.error,
        modelCount: secondResult.modelCount
      });
      if (secondResult.success) {
        return {
          success: true,
          provider: second.provider,
          model: secondResult.model,
          probes,
          availableModels: secondResult.availableModels
        };
      }

      return {
        success: false,
        error: `两种接口均连接失败`,
        probes
      };
    }
  );

  // Recommend models for 3 tiers via server-side AI
  ipcMain.handle(
    'config:recommend-models',
    async (_event, params: { models: string[] }) => {
      try {
        const requestBody = JSON.stringify({ models: params.models });
        const { timestamp, signature } = await signRequest(requestBody);
        const response = await fetch(`${PARSE_SERVER_URL}/api/recommend-models`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-App-Timestamp': timestamp,
            'X-App-Signature': signature
          },
          body: requestBody,
          signal: AbortSignal.timeout(30_000)
        });
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          return { error: body?.error || `HTTP ${response.status}` };
        }
        return await response.json();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return { error: message };
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
