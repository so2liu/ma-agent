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
import { sendChatEvent } from './ipc-utils';

interface OpenAIChatSession {
  chatId: string;
  piSession: AgentSession | null;
  isProcessing: boolean;
  shouldAbortSession: boolean;
  sessionTerminationPromise: Promise<void> | null;
  resolveTermination: (() => void) | null;
  unsubscribe: (() => void) | null;
  nextToolStreamIndex: number;
  toolResultSnapshots: Map<string, string>;
  currentPiModelKey: string | null;
}

const openAISessions = new Map<string, OpenAIChatSession>();
let toolCallCounter = 0;

function createOpenAIChatSession(chatId: string): OpenAIChatSession {
  return {
    chatId,
    piSession: null,
    isProcessing: false,
    shouldAbortSession: false,
    sessionTerminationPromise: null,
    resolveTermination: null,
    unsubscribe: null,
    nextToolStreamIndex: 0,
    toolResultSnapshots: new Map(),
    currentPiModelKey: null
  };
}

function getOrCreateOpenAIChatSession(chatId: string): OpenAIChatSession {
  const existing = openAISessions.get(chatId);
  if (existing) {
    return existing;
  }

  const session = createOpenAIChatSession(chatId);
  openAISessions.set(chatId, session);
  return session;
}

function clearToolTracking(session: OpenAIChatSession): void {
  session.nextToolStreamIndex = 0;
  session.toolResultSnapshots.clear();
}

function stringifyToolContent(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }

  if (content === null || typeof content === 'undefined') {
    return '';
  }

  try {
    return JSON.stringify(content, null, 2);
  } catch {
    return String(content);
  }
}

function getIncrementalDelta(previous: string, next: string): string {
  if (!previous) {
    return next;
  }

  if (next.startsWith(previous)) {
    return next.slice(previous.length);
  }

  let sharedPrefixLength = 0;
  const maxPrefixLength = Math.min(previous.length, next.length);
  while (sharedPrefixLength < maxPrefixLength) {
    if (previous[sharedPrefixLength] !== next[sharedPrefixLength]) {
      break;
    }
    sharedPrefixLength += 1;
  }

  return next.slice(sharedPrefixLength);
}

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

async function disposePiSession(session: OpenAIChatSession): Promise<void> {
  if (session.piSession) {
    try {
      await session.piSession.abort();
    } catch {
      // Ignore abort errors during session disposal
    }
    session.piSession.dispose();
    session.piSession = null;
  }

  if (session.unsubscribe) {
    session.unsubscribe();
    session.unsubscribe = null;
  }

  session.currentPiModelKey = null;
}

export function isOpenAISessionActive(chatId?: string): boolean {
  if (chatId) {
    const session = openAISessions.get(chatId);
    return Boolean(session?.isProcessing || session?.piSession);
  }

  return Array.from(openAISessions.values()).some(
    (session) => session.isProcessing || session.piSession !== null
  );
}

export async function interruptOpenAIResponse(
  mainWindow: BrowserWindow | null,
  chatId: string
): Promise<boolean> {
  const session = openAISessions.get(chatId);
  if (!session?.piSession || !session.isProcessing) {
    return false;
  }

  try {
    await session.piSession.abort();
    sendChatEvent(mainWindow, 'chat:message-stopped', chatId);
    return true;
  } catch (error) {
    console.error('Failed to interrupt Pi response:', error);
    throw error;
  }
}

export async function resetOpenAISession(chatId: string): Promise<void> {
  const session = openAISessions.get(chatId);
  if (!session) {
    return;
  }

  session.shouldAbortSession = true;
  clearToolTracking(session);
  await disposePiSession(session);

  if (session.sessionTerminationPromise) {
    await session.sessionTerminationPromise;
  }

  session.isProcessing = false;
  session.resolveTermination = null;
  session.sessionTerminationPromise = null;
  openAISessions.delete(chatId);
}

/**
 * Send a message to the OpenAI agent session.
 * Creates the session on first call, then sends the prompt.
 */
export async function sendOpenAIMessage(
  mainWindow: BrowserWindow | null,
  chatId: string,
  text: string,
  modelPreference: ChatModelPreference
): Promise<void> {
  const session = getOrCreateOpenAIChatSession(chatId);

  if (session.sessionTerminationPromise) {
    await session.sessionTerminationPromise;
  }

  session.shouldAbortSession = false;
  session.isProcessing = true;
  session.sessionTerminationPromise = new Promise((resolve) => {
    session.resolveTermination = resolve;
  });

  try {
    const modelId = getPiModelForPreference(modelPreference);
    const model = resolveModel(modelId);

    if (!model) {
      throw new Error(`Could not resolve Pi model: ${modelId}`);
    }

    const modelKey = `${model.provider}:${model.id}:${model.baseUrl ?? ''}`;

    if (session.piSession && session.currentPiModelKey !== modelKey) {
      await disposePiSession(session);
    }

    // Create session if needed
    if (!session.piSession) {
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

      const { session: agentSession } = await createAgentSession({
        cwd: getWorkspaceDir(),
        authStorage,
        model,
        thinkingLevel: 'medium',
        tools: codingTools,
        sessionManager: SessionManager.inMemory()
      });

      agentSession.agent.setSystemPrompt(SYSTEM_PROMPT_APPEND);
      session.piSession = agentSession;
      session.currentPiModelKey = modelKey;
      session.unsubscribe = agentSession.subscribe((event: AgentSessionEvent) => {
        if (session.shouldAbortSession) {
          return;
        }

        if (!mainWindow || mainWindow.isDestroyed()) {
          return;
        }

        handlePiEvent(mainWindow, session, event);
      });
    }

    await session.piSession.prompt(text);
  } catch (error) {
    console.error('Error in Pi session:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    sendChatEvent(mainWindow, 'chat:message-error', chatId, { error: errorMessage });
  } finally {
    clearToolTracking(session);
    session.isProcessing = false;
    session.resolveTermination?.();
    session.resolveTermination = null;
    session.sessionTerminationPromise = null;
  }
}

/**
 * Translate pi-coding-agent events into IPC events the renderer understands.
 */
function handlePiEvent(
  mainWindow: BrowserWindow,
  session: OpenAIChatSession,
  event: AgentSessionEvent
): void {
  const { chatId } = session;

  if (getDebugMode()) {
    sendChatEvent(mainWindow, 'chat:debug-message', chatId, {
      message: `[pi] ${event.type}: ${JSON.stringify(event).slice(0, 200)}`
    });
  }

  switch (event.type) {
    case 'message_update': {
      const assistantEvent = event.assistantMessageEvent;
      if (assistantEvent.type === 'text_delta') {
        sendChatEvent(mainWindow, 'chat:message-chunk', chatId, {
          chunk: assistantEvent.delta
        });
      } else if (assistantEvent.type === 'thinking_delta') {
        sendChatEvent(mainWindow, 'chat:thinking-chunk', chatId, {
          index: 0,
          delta: assistantEvent.delta
        });
      } else if (assistantEvent.type === 'thinking_start') {
        sendChatEvent(mainWindow, 'chat:thinking-start', chatId, { index: 0 });
      }
      break;
    }

    case 'tool_execution_start': {
      const toolId = event.toolCallId || `tool-${++toolCallCounter}`;
      const streamIndex = session.nextToolStreamIndex;
      session.nextToolStreamIndex += 1;
      session.toolResultSnapshots.delete(toolId);

      sendChatEvent(mainWindow, 'chat:tool-use-start', chatId, {
        id: toolId,
        name: event.toolName,
        input: event.args || {},
        streamIndex
      });
      break;
    }

    case 'tool_execution_update': {
      const toolUseId = event.toolCallId || '';
      if (!toolUseId || !event.partialResult) {
        break;
      }

      const content = stringifyToolContent(event.partialResult);
      const previousSnapshot = session.toolResultSnapshots.get(toolUseId) ?? '';
      if (!previousSnapshot) {
        sendChatEvent(mainWindow, 'chat:tool-result-start', chatId, {
          toolUseId,
          content,
          isError: false
        });
      } else {
        const delta = getIncrementalDelta(previousSnapshot, content);
        if (delta) {
          sendChatEvent(mainWindow, 'chat:tool-result-delta', chatId, {
            toolUseId,
            delta
          });
        }
      }

      session.toolResultSnapshots.set(toolUseId, content);
      break;
    }

    case 'tool_execution_end': {
      const toolUseId = event.toolCallId || '';
      const resultContent = stringifyToolContent(event.result);
      sendChatEvent(mainWindow, 'chat:tool-result-complete', chatId, {
        toolUseId,
        content: resultContent,
        isError: event.isError
      });
      session.toolResultSnapshots.delete(toolUseId);
      break;
    }

    case 'agent_end': {
      sendChatEvent(mainWindow, 'chat:message-complete', chatId);
      break;
    }

    case 'auto_retry_start': {
      sendChatEvent(mainWindow, 'chat:debug-message', chatId, {
        message: `Auto-retry attempt ${event.attempt}/${event.maxAttempts}: ${event.errorMessage}`
      });
      break;
    }

    default:
      break;
  }
}
