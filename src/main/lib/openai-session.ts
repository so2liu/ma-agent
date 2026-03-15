/**
 * OpenAI agent runtime using pi-coding-agent (from pi-mono).
 *
 * Runs in the same Node.js process as the Electron main process.
 * Translates pi-coding-agent events into the same IPC events that
 * the renderer expects, so the UI works identically regardless of provider.
 */
import { getModels } from '@mariozechner/pi-ai';
import type { Api, Model } from '@mariozechner/pi-ai';
import {
  AuthStorage,
  codingTools,
  createAgentSession,
  SessionManager,
  type AgentSession,
  type AgentSessionEvent
} from '@mariozechner/pi-coding-agent';
import type { BrowserWindow } from 'electron';

import {
  DEFAULT_OPENAI_MODEL_IDS,
  type ChatModelPreference
} from '../../shared/types/ipc';
import { SYSTEM_PROMPT_APPEND } from './claude-session';
import {
  getApiBaseUrl,
  getApiKey,
  getCustomModelIds,
  getDebugMode,
  getOpenAIApiKey,
  getOpenAIBaseUrl,
  getOpenAIModelId,
  getWorkspaceDir
} from './config';

let piSession: AgentSession | null = null;
let isProcessing = false;
let shouldAbortSession = false;
let sessionTerminationPromise: Promise<void> | null = null;
let currentUnsubscribe: (() => void) | null = null;
let currentPiModelKey: string | null = null;

// Tool call ID counter for generating unique IDs when pi doesn't provide them
let toolCallCounter = 0;

/**
 * Resolve the Pi model to use based on preference.
 * Priority: per-tier custom > openai.modelId (single override) > tier default.
 */
export function getPiModelForPreference(preference: ChatModelPreference = 'fast'): string {
  // Per-tier custom model IDs take highest priority (set in Settings model config)
  const customModelIds = getCustomModelIds();
  const perTierCustom = customModelIds[preference]?.trim();
  if (perTierCustom) return perTierCustom;

  // Legacy single OpenAI model override (applies to all tiers)
  const openAIModelId = getOpenAIModelId();
  if (openAIModelId) return openAIModelId;

  return DEFAULT_OPENAI_MODEL_IDS[preference] ?? DEFAULT_OPENAI_MODEL_IDS.fast;
}

function isAnthropicModel(model: Model<Api>): boolean {
  return model.provider === 'anthropic' || model.api === 'anthropic-messages';
}

function getBuiltinModel(modelId: string): Model<Api> | undefined {
  for (const provider of ['openai', 'anthropic'] as const) {
    const model = getModels(provider).find((entry) => entry.id === modelId);
    if (model) {
      return model as Model<Api>;
    }
  }
  return undefined;
}

export function resolveModel(modelId: string): Model<Api> | undefined {
  const builtinModel = getBuiltinModel(modelId);
  if (builtinModel) {
    if (isAnthropicModel(builtinModel)) {
      const customBaseUrl = getApiBaseUrl();
      return customBaseUrl ? { ...builtinModel, baseUrl: customBaseUrl } : builtinModel;
    }

    const customBaseUrl = getOpenAIBaseUrl();
    return customBaseUrl ? { ...builtinModel, baseUrl: customBaseUrl } : builtinModel;
  }

  // For unknown model IDs, use name heuristic to pick the right provider fallback.
  // Models starting with "claude" are likely Anthropic; everything else tries OpenAI first.
  const looksAnthropic = /^claude/i.test(modelId);

  if (looksAnthropic) {
    const anthropicBaseUrl = getApiBaseUrl();
    if (anthropicBaseUrl) {
      return {
        id: modelId,
        name: modelId,
        api: 'anthropic-messages' as Api,
        provider: 'anthropic',
        baseUrl: anthropicBaseUrl,
        reasoning: true,
        input: ['text', 'image'],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 200_000,
        maxTokens: 64_000
      };
    }
  }

  const openAIBaseUrl = getOpenAIBaseUrl();
  if (openAIBaseUrl) {
    return {
      id: modelId,
      name: modelId,
      api: 'openai-completions' as Api,
      provider: 'openai',
      baseUrl: openAIBaseUrl,
      reasoning: false,
      input: ['text', 'image'],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 128_000,
      maxTokens: 16_384
    };
  }

  // Last resort: try Anthropic base URL for non-Claude models too
  if (!looksAnthropic) {
    const anthropicBaseUrl = getApiBaseUrl();
    if (anthropicBaseUrl) {
      return {
        id: modelId,
        name: modelId,
        api: 'anthropic-messages' as Api,
        provider: 'anthropic',
        baseUrl: anthropicBaseUrl,
        reasoning: true,
        input: ['text', 'image'],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 200_000,
        maxTokens: 64_000
      };
    }
  }

  return undefined;
}

async function disposePiSession(): Promise<void> {
  if (piSession) {
    try {
      await piSession.abort();
    } catch {
      // Ignore abort errors during session disposal
    }
    piSession.dispose();
    piSession = null;
  }

  if (currentUnsubscribe) {
    currentUnsubscribe();
    currentUnsubscribe = null;
  }

  currentPiModelKey = null;
}

export function isOpenAISessionActive(): boolean {
  return isProcessing || piSession !== null;
}

export async function interruptOpenAIResponse(mainWindow: BrowserWindow | null): Promise<boolean> {
  if (!piSession) return false;

  try {
    await piSession.abort();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('chat:message-stopped');
    }
    return true;
  } catch (error) {
    console.error('Failed to interrupt OpenAI response:', error);
    throw error;
  }
}

export async function resetOpenAISession(): Promise<void> {
  shouldAbortSession = true;
  await disposePiSession();

  if (sessionTerminationPromise) {
    await sessionTerminationPromise;
  }

  isProcessing = false;
  sessionTerminationPromise = null;
}

/**
 * Send a message to the OpenAI agent session.
 * Creates the session on first call, then sends the prompt.
 */
export async function sendOpenAIMessage(
  mainWindow: BrowserWindow | null,
  text: string,
  modelPreference: ChatModelPreference
): Promise<void> {
  if (sessionTerminationPromise) {
    await sessionTerminationPromise;
  }

  shouldAbortSession = false;
  isProcessing = true;

  let resolveTermination: () => void;
  sessionTerminationPromise = new Promise((resolve) => {
    resolveTermination = resolve;
  });

  try {
    const modelId = getPiModelForPreference(modelPreference);
    const model = resolveModel(modelId);

    if (!model) {
      throw new Error(`Could not resolve Pi model: ${modelId}`);
    }

    const modelKey = `${model.provider}:${model.id}:${model.baseUrl ?? ''}`;

    if (piSession && currentPiModelKey !== modelKey) {
      await disposePiSession();
    }

    // Create session if needed
    if (!piSession) {
      const authStorage = AuthStorage.inMemory();
      if (isAnthropicModel(model)) {
        const apiKey = getApiKey();
        if (!apiKey) {
          throw new Error('Anthropic API key is not configured');
        }
        authStorage.setRuntimeApiKey('anthropic', apiKey);
      } else {
        const apiKey = getOpenAIApiKey();
        if (!apiKey) {
          throw new Error('OpenAI API key is not configured');
        }
        authStorage.setRuntimeApiKey('openai', apiKey);
      }

      const { session } = await createAgentSession({
        cwd: getWorkspaceDir(),
        authStorage,
        model,
        thinkingLevel: 'medium',
        tools: codingTools,
        sessionManager: SessionManager.inMemory()
      });

      // Set the system prompt
      session.agent.setSystemPrompt(SYSTEM_PROMPT_APPEND);

      piSession = session;
      currentPiModelKey = modelKey;

      // Subscribe to events and translate to IPC
      currentUnsubscribe = piSession.subscribe((event: AgentSessionEvent) => {
        if (shouldAbortSession) return;
        if (!mainWindow || mainWindow.isDestroyed()) return;

        handlePiEvent(mainWindow, event);
      });
    }

    // Send the prompt
    await piSession.prompt(text);
  } catch (error) {
    console.error('Error in Pi session:', error);
    if (mainWindow && !mainWindow.isDestroyed()) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      mainWindow.webContents.send('chat:message-error', errorMessage);
    }
  } finally {
    isProcessing = false;
    resolveTermination!();
  }
}

/**
 * Translate pi-coding-agent events into IPC events the renderer understands.
 */
function handlePiEvent(mainWindow: BrowserWindow, event: AgentSessionEvent): void {
  if (getDebugMode()) {
    mainWindow.webContents.send(
      'chat:debug-message',
      `[pi] ${event.type}: ${JSON.stringify(event).slice(0, 200)}`
    );
  }

  switch (event.type) {
    case 'message_update': {
      const assistantEvent = event.assistantMessageEvent;
      if (assistantEvent.type === 'text_delta') {
        mainWindow.webContents.send('chat:message-chunk', assistantEvent.delta);
      } else if (assistantEvent.type === 'thinking_delta') {
        mainWindow.webContents.send('chat:thinking-chunk', {
          index: 0,
          delta: assistantEvent.delta
        });
      } else if (assistantEvent.type === 'thinking_start') {
        mainWindow.webContents.send('chat:thinking-start', { index: 0 });
      }
      break;
    }

    case 'tool_execution_start': {
      const toolId = event.toolCallId || `tool-${++toolCallCounter}`;
      mainWindow.webContents.send('chat:tool-use-start', {
        id: toolId,
        name: event.toolName,
        input: event.args || {},
        streamIndex: toolCallCounter
      });
      break;
    }

    case 'tool_execution_update': {
      const updateToolId = event.toolCallId || '';
      if (event.partialResult) {
        const content =
          typeof event.partialResult === 'string' ?
            event.partialResult
          : JSON.stringify(event.partialResult, null, 2);
        mainWindow.webContents.send('chat:tool-result-start', {
          toolUseId: updateToolId,
          content,
          isError: false
        });
      }
      break;
    }

    case 'tool_execution_end': {
      const endToolId = event.toolCallId || '';
      const resultContent =
        typeof event.result === 'string' ? event.result : JSON.stringify(event.result, null, 2);
      mainWindow.webContents.send('chat:tool-result-complete', {
        toolUseId: endToolId,
        content: resultContent,
        isError: event.isError
      });
      break;
    }

    case 'agent_end': {
      mainWindow.webContents.send('chat:message-complete');
      break;
    }

    case 'auto_retry_start': {
      mainWindow.webContents.send(
        'chat:debug-message',
        `Auto-retry attempt ${event.attempt}/${event.maxAttempts}: ${event.errorMessage}`
      );
      break;
    }

    default:
      // Other events (turn_start, turn_end, message_start, message_end, etc.)
      // are internal lifecycle events that don't need IPC translation
      break;
  }
}
