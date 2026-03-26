import { join } from 'path';
import { app } from 'electron';
import { getModels } from '@mariozechner/pi-ai';
import type { Api, AssistantMessage, Model, ToolCall } from '@mariozechner/pi-ai';
import {
  AuthStorage,
  createAgentSession,
  createCodingTools,
  DefaultResourceLoader,
  SessionManager as PiSessionManager,
  type AgentSession,
  type AgentSessionEvent
} from '@mariozechner/pi-coding-agent';

import {
  DEFAULT_MODEL_IDS,
  type ChatModelPreference
} from '../../shared/types/ipc';
import {
  getApiBaseUrl,
  getApiKey,
  getChatModelPreferenceSetting,
  getCustomModelId,
  getCustomModelIds,
  getOpenAIApiKey,
  getOpenAIBaseUrl,
  setChatModelPreferenceSetting,
  getWorkspaceDir
} from './config';
import type {
  AgentRuntime,
  RuntimeEvent,
  RuntimeEventHandler,
  RuntimeMessage
} from './agent-runtime';
import { buildPlainTextWithAttachments } from '../handlers/chat-helpers';

const TOOL_NAME_MAP: Record<string, string> = {
  read: 'Read',
  bash: 'Bash',
  edit: 'Edit',
  write: 'Write',
  grep: 'Grep',
  find: 'Glob'
};

/**
 * System prompt append for 小马快跑 (Xiaoma Kuaipao) — tailored for non-technical users.
 */
export const SYSTEM_PROMPT_APPEND = `**你的身份：**
你是"小马快跑"，一个友好、专业的 AI 工作助手。请始终用"小马快跑"称呼自己，不要使用 "Claude"、"Claude Code" 或其他名称。用中文回复用户，除非用户明确使用其他语言。

**用户画像：**
你的用户主要是非技术岗位的职场人士，包括但不限于市场营销、市场分析、财务、产品经理、运营、行政等。他们通常不了解编程或技术术语。请：
- 用简单易懂的语言沟通，避免技术术语（如 API、SDK、CLI、环境变量等）
- 主动理解用户的业务意图，而非等待精确的技术指令
- 当需要执行技术操作时，直接执行并用通俗语言解释结果
- 以业务成果为导向，而非技术实现细节

**核心能力：**
- 数据分析与可视化：处理 Excel/CSV 数据，生成图表和分析报告
- 文档处理：撰写、编辑、翻译各类文档（Word、PDF 等）
- 市场研究：搜索和整理行业信息、竞品分析、市场趋势
- 文案创作：营销文案、社交媒体内容、邮件、报告
- 日常办公：整理信息、制作表格、计算汇总、格式转换

**工作目录：**
这是一个多用途工作目录，用户的不同项目和文件可能存放在不同子目录中。操作文件前先了解目录结构。

**工具使用偏好：**
- Python: 优先使用 python3（如果可用）。不要假设 uv、pip 或 conda 已安装。
- JavaScript/TypeScript: 使用 node/npm/npx。如果 bun 在 PATH 中可用，优先使用 bun。

**记忆：**
在工作目录根目录维护 \`CLAUDE.md\` 作为持久记忆。持续更新（不只是被要求时）：用户偏好、常用文件位置、项目信息、以及任何对未来任务有用的信息。`;

let currentModelPreference: ChatModelPreference = getChatModelPreferenceSetting();

function normalizeToolName(toolName: string): string {
  return TOOL_NAME_MAP[toolName] ?? toolName;
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

function mergeSystemPrompt(basePrompt: string | undefined): string {
  if (basePrompt?.trim()) {
    return `${basePrompt}\n\n${SYSTEM_PROMPT_APPEND}`;
  }

  return SYSTEM_PROMPT_APPEND;
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

function isAnthropicModel(model: Model<Api>): boolean {
  return model.provider === 'anthropic' || model.api === 'anthropic-messages';
}

function configureAuthStorage(authStorage: AuthStorage): void {
  const anthropicKey = getApiKey();
  if (anthropicKey) {
    authStorage.setRuntimeApiKey('anthropic', anthropicKey);
  }

  const openAIKey = getOpenAIApiKey();
  if (openAIKey) {
    authStorage.setRuntimeApiKey('openai', openAIKey);
  }
}

function getToolCallFromMessage(
  message: AssistantMessage,
  contentIndex: number
): ToolCall | null {
  const contentBlock = message.content[contentIndex];
  return contentBlock?.type === 'toolCall' ? contentBlock : null;
}

async function resolveSessionManager(
  cwd: string,
  sessionDir: string,
  resumeSessionId: string | null
): Promise<{ sessionManager: PiSessionManager; resumed: boolean }> {
  const trimmedResumeId = resumeSessionId?.trim() || null;
  if (!trimmedResumeId) {
    return {
      sessionManager: PiSessionManager.create(cwd, sessionDir),
      resumed: false
    };
  }

  const existingSessions = await PiSessionManager.list(cwd, sessionDir);
  const matchedSession = existingSessions.find((session) => session.id === trimmedResumeId);

  if (!matchedSession) {
    return {
      sessionManager: PiSessionManager.create(cwd, sessionDir),
      resumed: false
    };
  }

  return {
    sessionManager: PiSessionManager.open(matchedSession.path, sessionDir),
    resumed: true
  };
}

export function getPiModelForPreference(
  preference: ChatModelPreference = currentModelPreference
): string {
  const customModelIds = getCustomModelIds();
  const perTierCustom = customModelIds[preference]?.trim();
  if (perTierCustom) {
    return perTierCustom;
  }

  const customModelId = getCustomModelId();
  if (customModelId) {
    return customModelId;
  }

  return DEFAULT_MODEL_IDS[preference] ?? DEFAULT_MODEL_IDS.fast;
}

export function resolveModel(modelId: string): Model<Api> | undefined {
  const builtinModel = getBuiltinModel(modelId);
  if (builtinModel) {
    if (isAnthropicModel(builtinModel)) {
      const anthropicBaseUrl = getApiBaseUrl();
      return anthropicBaseUrl ? { ...builtinModel, baseUrl: anthropicBaseUrl } : builtinModel;
    }

    const openAIBaseUrl = getOpenAIBaseUrl();
    return openAIBaseUrl ? { ...builtinModel, baseUrl: openAIBaseUrl } : builtinModel;
  }

  // Determine provider for unknown model IDs:
  // 1. If the name looks like a Claude model, use Anthropic
  // 2. If the user has Anthropic credentials configured (key + baseUrl), prefer Anthropic
  //    (covers OpenRouter and other Anthropic-compatible proxies)
  // 3. Otherwise fall back to OpenAI
  const looksAnthropic = /^claude/i.test(modelId);
  const hasAnthropicConfig = !!(getApiKey() && getApiBaseUrl());
  const hasOpenAIConfig = !!getOpenAIApiKey();
  const useAnthropic = looksAnthropic || (hasAnthropicConfig && !hasOpenAIConfig);

  if (useAnthropic) {
    const anthropicBaseUrl = getApiBaseUrl();
    return {
      id: modelId,
      name: modelId,
      api: 'anthropic-messages' as Api,
      provider: 'anthropic',
      ...(anthropicBaseUrl ? { baseUrl: anthropicBaseUrl } : {}),
      reasoning: true,
      input: ['text', 'image'],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 200_000,
      maxTokens: 64_000
    } as Model<Api>;
  }

  const openAIBaseUrl = getOpenAIBaseUrl();
  return {
    id: modelId,
    name: modelId,
    api: 'openai-completions' as Api,
    provider: 'openai',
    ...(openAIBaseUrl ? { baseUrl: openAIBaseUrl } : {}),
    reasoning: false,
    input: ['text', 'image'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128_000,
    maxTokens: 16_384
  } as Model<Api>;
}

export function getCurrentModelPreference(): ChatModelPreference {
  return currentModelPreference;
}

export async function setChatModelPreference(preference: ChatModelPreference): Promise<void> {
  currentModelPreference = preference;
  setChatModelPreferenceSetting(preference);
}

export class PiRuntime implements AgentRuntime {
  private session: AgentSession | null = null;
  private unsubscribe: (() => void) | null = null;
  private handlers = new Set<RuntimeEventHandler>();
  private processing = false;
  private messageQueue: Array<{
    message: RuntimeMessage;
    resolve: () => void;
    reject: (error: Error) => void;
  }> = [];
  private pendingResumeSessionId: string | null = null;
  private suppressCompletion = false;
  private turnErrored = false;
  private activeThinkingBlocks = new Set<number>();
  private toolInputSnapshots = new Map<string, string>();
  private toolResultSnapshots = new Map<string, string>();
  private toolStreamIndexes = new Map<string, number>();
  private generation = 0;
  private modelPreference: ChatModelPreference;

  constructor(modelPreference: ChatModelPreference = currentModelPreference) {
    this.modelPreference = modelPreference;
  }

  async sendMessage(message: RuntimeMessage): Promise<void> {
    if (this.processing) {
      // Queue the message and wait for it to be processed
      return new Promise<void>((resolve, reject) => {
        this.messageQueue.push({ message, resolve, reject });
      });
    }

    await this.processMessage(message);
  }

  private async processMessage(message: RuntimeMessage): Promise<void> {
    await this.ensureSession();

    const session = this.session;
    if (!session) {
      throw new Error('Agent session is not initialized');
    }

    this.processing = true;
    this.suppressCompletion = false;
    this.turnErrored = false;
    this.clearTurnState();

    const text = buildPlainTextWithAttachments(message.text, message.attachments ?? []);

    try {
      await session.prompt(text);
    } catch (error) {
      if (!this.suppressCompletion) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        this.turnErrored = true;
        this.suppressCompletion = true;
        this.emit({ type: 'message-error', error: errorMessage });
      }
      throw error;
    } finally {
      this.processing = false;
      this.clearTurnState();
      await this.drainMessageQueue();
    }
  }

  private async drainMessageQueue(): Promise<void> {
    while (this.messageQueue.length > 0) {
      const queued = this.messageQueue.shift()!;
      try {
        await this.processMessage(queued.message);
        queued.resolve();
      } catch (error) {
        queued.reject(error instanceof Error ? error : new Error(String(error)));
      }
    }
  }

  async interrupt(): Promise<boolean> {
    if (!this.session || !this.processing) {
      return false;
    }

    this.suppressCompletion = true;
    await this.session.abort();
    this.processing = false;
    this.emit({ type: 'message-stopped' });
    return true;
  }

  async reset(resumeSessionId?: string | null): Promise<void> {
    this.pendingResumeSessionId = resumeSessionId?.trim() || null;
    this.suppressCompletion = true;
    this.turnErrored = false;
    this.processing = false;
    this.clearTurnState();
    this.generation += 1;

    if (!this.session) {
      return;
    }

    const currentSession = this.session;
    this.session = null;

    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }

    try {
      await currentSession.abort();
    } catch {
      // Ignore abort failures during reset.
    }

    currentSession.dispose();
  }

  isActive(): boolean {
    return this.processing || this.session !== null;
  }

  onEvent(handler: RuntimeEventHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  async setModelPreference(preference: ChatModelPreference): Promise<void> {
    this.modelPreference = preference;
    await setChatModelPreference(preference);

    if (!this.session) {
      return;
    }

    const modelId = getPiModelForPreference(preference);
    const model = resolveModel(modelId);
    if (!model) {
      throw new Error(`Could not resolve model: ${modelId}`);
    }

    await this.session.setModel(model);
  }

  getModelPreference(): ChatModelPreference {
    return this.modelPreference;
  }

  private emit(event: RuntimeEvent): void {
    for (const handler of this.handlers) {
      handler(event);
    }
  }

  private clearTurnState(): void {
    this.activeThinkingBlocks.clear();
    this.toolInputSnapshots.clear();
    this.toolResultSnapshots.clear();
    this.toolStreamIndexes.clear();
  }

  private async ensureSession(): Promise<void> {
    if (this.session) {
      return;
    }

    const cwd = getWorkspaceDir();
    const sessionDir = join(app.getPath('userData'), 'sessions');
    const authStorage = AuthStorage.inMemory();
    configureAuthStorage(authStorage);

    const modelId = getPiModelForPreference(this.modelPreference);
    const model = resolveModel(modelId);
    if (!model) {
      throw new Error(`Could not resolve model: ${modelId}`);
    }

    const resourceLoader = new DefaultResourceLoader({
      cwd,
      additionalSkillPaths: [join(cwd, '.claude', 'skills')],
      systemPromptOverride: mergeSystemPrompt
    });
    await resourceLoader.reload();

    const { sessionManager, resumed } = await resolveSessionManager(
      cwd,
      sessionDir,
      this.pendingResumeSessionId
    );
    this.pendingResumeSessionId = null;

    const { session } = await createAgentSession({
      cwd,
      authStorage,
      model,
      thinkingLevel: 'medium',
      tools: createCodingTools(cwd),
      resourceLoader,
      sessionManager
    });

    const generation = ++this.generation;
    this.session = session;
    this.unsubscribe = session.subscribe((event) => {
      if (generation !== this.generation) {
        return;
      }

      this.handleSessionEvent(event);
    });

    this.emit({
      type: 'session-updated',
      sessionId: session.sessionId,
      resumed
    });
  }

  private handleSessionEvent(event: AgentSessionEvent): void {
    switch (event.type) {
      case 'message_update':
        this.handleMessageUpdate(event);
        break;

      case 'message_end':
        this.handleMessageEnd(event);
        break;

      case 'tool_execution_start':
        this.toolResultSnapshots.delete(event.toolCallId);
        break;

      case 'tool_execution_update':
        this.handleToolExecutionUpdate(event);
        break;

      case 'tool_execution_end':
        this.handleToolExecutionEnd(event);
        break;

      case 'agent_end':
        if (!this.suppressCompletion && !this.turnErrored) {
          this.emit({ type: 'message-complete' });
        }
        this.suppressCompletion = false;
        this.turnErrored = false;
        break;

      case 'auto_retry_start':
        this.emit({
          type: 'debug-message',
          message: `Auto-retry attempt ${event.attempt}/${event.maxAttempts}: ${event.errorMessage}`
        });
        break;

      default:
        break;
    }
  }

  private handleMessageUpdate(
    event: Extract<AgentSessionEvent, { type: 'message_update' }>
  ): void {
    if (event.message.role !== 'assistant') {
      return;
    }

    const assistantMessage = event.message;
    const assistantEvent = event.assistantMessageEvent;

    switch (assistantEvent.type) {
      case 'text_delta':
        this.emit({ type: 'message-chunk', text: assistantEvent.delta });
        break;

      case 'thinking_start':
        this.activeThinkingBlocks.add(assistantEvent.contentIndex);
        this.emit({ type: 'thinking-start', index: assistantEvent.contentIndex });
        break;

      case 'thinking_delta':
        this.activeThinkingBlocks.add(assistantEvent.contentIndex);
        this.emit({
          type: 'thinking-chunk',
          index: assistantEvent.contentIndex,
          delta: assistantEvent.delta
        });
        break;

      case 'toolcall_start': {
        const toolCall = getToolCallFromMessage(assistantMessage, assistantEvent.contentIndex);
        if (!toolCall) {
          break;
        }

        this.toolStreamIndexes.set(toolCall.id, assistantEvent.contentIndex);
        this.emit({
          type: 'tool-use-start',
          id: toolCall.id,
          name: normalizeToolName(toolCall.name),
          input: toolCall.arguments ?? {},
          streamIndex: assistantEvent.contentIndex
        });
        break;
      }

      case 'toolcall_delta': {
        const toolCall = getToolCallFromMessage(assistantMessage, assistantEvent.contentIndex);
        if (!toolCall) {
          break;
        }

        const previousSnapshot = this.toolInputSnapshots.get(toolCall.id) ?? '';
        this.toolInputSnapshots.set(toolCall.id, previousSnapshot + assistantEvent.delta);
        this.toolStreamIndexes.set(toolCall.id, assistantEvent.contentIndex);
        this.emit({
          type: 'tool-input-delta',
          index: assistantEvent.contentIndex,
          toolId: toolCall.id,
          delta: assistantEvent.delta
        });
        break;
      }

      case 'toolcall_end': {
        const serializedInput = JSON.stringify(assistantEvent.toolCall.arguments ?? {}, null, 2);
        const previousSnapshot = this.toolInputSnapshots.get(assistantEvent.toolCall.id) ?? '';
        const delta = getIncrementalDelta(previousSnapshot, serializedInput);

        if (delta) {
          this.emit({
            type: 'tool-input-delta',
            index: assistantEvent.contentIndex,
            toolId: assistantEvent.toolCall.id,
            delta
          });
        }

        this.toolInputSnapshots.set(assistantEvent.toolCall.id, serializedInput);
        this.toolStreamIndexes.set(assistantEvent.toolCall.id, assistantEvent.contentIndex);
        this.emit({
          type: 'content-block-stop',
          index: assistantEvent.contentIndex,
          toolId: assistantEvent.toolCall.id
        });
        break;
      }

      default:
        break;
    }
  }

  private handleMessageEnd(
    event: Extract<AgentSessionEvent, { type: 'message_end' }>
  ): void {
    if (event.message.role !== 'assistant') {
      return;
    }

    for (const thinkingIndex of this.activeThinkingBlocks) {
      this.emit({ type: 'content-block-stop', index: thinkingIndex });
    }
    this.activeThinkingBlocks.clear();

    if (event.message.stopReason === 'aborted') {
      this.suppressCompletion = true;
      return;
    }

    if (event.message.stopReason === 'error') {
      this.suppressCompletion = true;
      this.turnErrored = true;
      this.emit({
        type: 'message-error',
        error: event.message.errorMessage || 'Unknown error occurred'
      });
    }
  }

  private handleToolExecutionUpdate(
    event: Extract<AgentSessionEvent, { type: 'tool_execution_update' }>
  ): void {
    const content = stringifyToolContent(event.partialResult);
    const previousSnapshot = this.toolResultSnapshots.get(event.toolCallId) ?? '';

    if (!previousSnapshot) {
      this.emit({
        type: 'tool-result-start',
        toolUseId: event.toolCallId,
        content,
        isError: false
      });
    }

    this.toolResultSnapshots.set(event.toolCallId, content);
  }

  private handleToolExecutionEnd(
    event: Extract<AgentSessionEvent, { type: 'tool_execution_end' }>
  ): void {
    const resultContent = stringifyToolContent(event.result);
    const previousSnapshot = this.toolResultSnapshots.get(event.toolCallId) ?? '';
    const streamIndex = this.toolStreamIndexes.get(event.toolCallId) ?? 0;

    if (!previousSnapshot) {
      this.emit({
        type: 'tool-result-start',
        toolUseId: event.toolCallId,
        content: resultContent,
        isError: event.isError
      });
    }

    this.emit({
      type: 'content-block-stop',
      index: streamIndex,
      toolId: event.toolCallId
    });
    this.emit({
      type: 'tool-result-complete',
      toolUseId: event.toolCallId,
      content: resultContent,
      isError: event.isError
    });

    this.toolResultSnapshots.delete(event.toolCallId);
  }
}
