import type { AnalyticsEventType } from '../../shared/types/analytics';
import type { BackgroundTask } from '../../shared/types/background-task';
import type {
  ChatContentBlockStopEvent,
  ChatDebugMessageEvent,
  ChatLifecycleEvent,
  ChatMessageChunkEvent,
  ChatMessageErrorEvent,
  ChatRetryStatusEvent,
  ChatSessionUpdatedEvent,
  ChatThinkingChunkEvent,
  ChatThinkingStartEvent,
  ChatToolInputDeltaEvent,
  ChatToolResultCompleteEvent,
  ChatToolResultDeltaEvent,
  ChatToolResultStartEvent,
  ChatToolUseStartEvent,
  RetryStatus
} from '@/electron';
import type { ContentBlock, Message, ToolInput } from '@/types/chat';
import { classifyError } from '@/utils/friendlyError';
import { parsePartialJson } from '@/utils/parsePartialJson';

const RETRY_DELAYS_MS = [2000, 4000, 8000] as const;
const MAX_CACHED_CHAT_STATES = 24;

type MessageUpdater = Message[] | ((prev: Message[]) => Message[]);
type BooleanUpdater = boolean | ((prev: boolean) => boolean);

export interface ActiveRetryStatus extends RetryStatus {
  nextRetryAt: number;
  secondsRemaining: number;
}

export interface ChatState {
  messages: Message[];
  isLoading: boolean;
  isStreaming: boolean;
  sessionId: string | null;
  backgroundTasks: Map<string, BackgroundTask>;
  retryStatus: ActiveRetryStatus | null;
  debugMessages: string[];
  subscribers: Set<() => void>;
  lastError: string | null;
  isDirty: boolean;
  saveTimeoutId: number | null;
  lastAccessedAt: number;
}

type PersistedMessage = Omit<Message, 'timestamp'> & { timestamp: string };

const chatStates = new Map<string, ChatState>();
const conversationToChatId = new Map<string, string>();
const chatIdToConversation = new Map<string, string>();
const storeSubscribers = new Set<() => void>();

let listenersInitialized = false;
let retryTickerId: number | null = null;

export function serializeMessagesForStorage(messages: Message[]): PersistedMessage[] {
  return messages.map((msg) => ({
    ...msg,
    attachments: msg.attachments?.map(
      ({ previewUrl: _previewUrl, ...attachmentRest }) => attachmentRest
    ),
    timestamp: msg.timestamp.toISOString()
  }));
}

function createRetryStatus(status: RetryStatus): ActiveRetryStatus {
  return {
    ...status,
    nextRetryAt: Date.now() + status.retryInMs,
    secondsRemaining: Math.max(1, Math.ceil(status.retryInMs / 1000))
  };
}

function createChatState(): ChatState {
  return {
    messages: [],
    isLoading: false,
    isStreaming: false,
    sessionId: null,
    backgroundTasks: new Map(),
    retryStatus: null,
    debugMessages: [],
    subscribers: new Set(),
    lastError: null,
    isDirty: false,
    saveTimeoutId: null,
    lastAccessedAt: Date.now()
  };
}

function touchState(state: ChatState): void {
  state.lastAccessedAt = Date.now();
}

function notifySubscribers(state: ChatState): void {
  touchState(state);
  state.subscribers.forEach((subscriber) => subscriber());
  storeSubscribers.forEach((subscriber) => subscriber());
}

function shouldPersistChat(state: ChatState): boolean {
  return state.messages.length > 0;
}

async function persistChat(chatId: string): Promise<void> {
  const conversationId = chatIdToConversation.get(chatId);
  const state = chatStates.get(chatId);
  if (!conversationId || !state || !state.isDirty || !shouldPersistChat(state)) {
    return;
  }

  try {
    await window.electron.conversation.update(
      conversationId,
      undefined,
      serializeMessagesForStorage(state.messages),
      state.sessionId ?? undefined
    );
    state.isDirty = false;
    touchState(state);
  } catch (error) {
    console.error('Error auto-saving conversation:', error);
  }
}

function schedulePersist(chatId: string): void {
  const conversationId = chatIdToConversation.get(chatId);
  const state = chatStates.get(chatId);
  if (!conversationId || !state) {
    return;
  }

  if (state.saveTimeoutId !== null) {
    window.clearTimeout(state.saveTimeoutId);
  }

  state.saveTimeoutId = window.setTimeout(() => {
    state.saveTimeoutId = null;
    void persistChat(chatId);
  }, 2000);
}

function markDirty(chatId: string): void {
  const state = chatStates.get(chatId);
  if (!state) {
    return;
  }

  state.isDirty = true;
  schedulePersist(chatId);
}

function ensureRetryTicker(): void {
  if (retryTickerId !== null) {
    return;
  }

  retryTickerId = window.setInterval(() => {
    let hasActiveRetry = false;

    chatStates.forEach((state) => {
      const retryStatus = state.retryStatus;
      if (!retryStatus) {
        return;
      }

      hasActiveRetry = true;
      const remainingMs = retryStatus.nextRetryAt - Date.now();
      let nextStatus = retryStatus;

      if (remainingMs > 0) {
        const nextSeconds = Math.max(1, Math.ceil(remainingMs / 1000));
        if (nextSeconds !== retryStatus.secondsRemaining) {
          nextStatus = { ...retryStatus, secondsRemaining: nextSeconds };
        }
      } else if (retryStatus.attempt >= retryStatus.maxAttempts) {
        if (retryStatus.secondsRemaining !== 0) {
          nextStatus = { ...retryStatus, secondsRemaining: 0 };
        }
      } else {
        const nextAttempt = retryStatus.attempt + 1;
        const nextDelay = RETRY_DELAYS_MS[nextAttempt - 1] ?? retryStatus.retryInMs;
        nextStatus = createRetryStatus({
          attempt: nextAttempt,
          maxAttempts: retryStatus.maxAttempts,
          retryInMs: nextDelay
        });
      }

      if (nextStatus !== retryStatus) {
        state.retryStatus = nextStatus;
        notifySubscribers(state);
      }
    });

    if (!hasActiveRetry && retryTickerId !== null) {
      window.clearInterval(retryTickerId);
      retryTickerId = null;
    }
  }, 250);
}

function getOrCreateStateInternal(chatId: string): ChatState {
  const existing = chatStates.get(chatId);
  if (existing) {
    touchState(existing);
    return existing;
  }

  const state = createChatState();
  chatStates.set(chatId, state);
  pruneInactiveChatStates();
  return state;
}

function canPruneChatState(chatId: string, state: ChatState): boolean {
  const conversationId = chatIdToConversation.get(chatId);
  return (
    state.subscribers.size === 0 &&
    !state.isLoading &&
    !state.isStreaming &&
    state.saveTimeoutId === null &&
    !state.isDirty &&
    (typeof conversationId === 'string' || state.messages.length === 0)
  );
}

function disposeChatState(chatId: string): void {
  const state = chatStates.get(chatId);
  if (!state) {
    return;
  }

  if (state.saveTimeoutId !== null) {
    window.clearTimeout(state.saveTimeoutId);
    state.saveTimeoutId = null;
  }

  const conversationId = chatIdToConversation.get(chatId);
  if (conversationId) {
    conversationToChatId.delete(conversationId);
  }

  chatIdToConversation.delete(chatId);
  chatStates.delete(chatId);
}

function pruneInactiveChatStates(): void {
  if (chatStates.size <= MAX_CACHED_CHAT_STATES) {
    return;
  }

  const candidates = Array.from(chatStates.entries())
    .filter(([chatId, state]) => canPruneChatState(chatId, state))
    .sort(([, left], [, right]) => left.lastAccessedAt - right.lastAccessedAt);

  const pruneCount = Math.max(0, chatStates.size - MAX_CACHED_CHAT_STATES);
  for (const [chatId] of candidates.slice(0, pruneCount)) {
    // Destroy the corresponding main-process session to prevent orphaned sessions
    window.electron.chat.destroySession(chatId).catch(() => {});
    disposeChatState(chatId);
  }
}

function appendDebugContent(message: Message, debugMessages: string[]): Message {
  if (debugMessages.length === 0) {
    return message;
  }

  const debugContent = `\n\n---\n**🔍 Debug Output:**\n\`\`\`\n${debugMessages.join('\n')}\n\`\`\`\n`;
  if (typeof message.content === 'string') {
    return { ...message, content: message.content + debugContent };
  }

  return {
    ...message,
    content: [...message.content, { type: 'text', text: debugContent }]
  };
}

function updateMessages(chatId: string, updater: (prev: Message[]) => Message[], mark = true): void {
  const state = getOrCreateStateInternal(chatId);
  touchState(state);
  state.messages = updater(state.messages);
  if (mark) {
    markDirty(chatId);
  }
  notifySubscribers(state);
}

/**
 * Find a tool_use block by ID in the last assistant message and apply an updater to it.
 * Returns unchanged messages if the block is not found.
 */
function updateToolBlock(
  chatId: string,
  toolId: string,
  updater: (tool: NonNullable<ContentBlock['tool']>) => Partial<NonNullable<ContentBlock['tool']>>
): void {
  updateMessages(chatId, (prev) => {
    const lastMessage = prev[prev.length - 1];
    if (!lastMessage || lastMessage.role !== 'assistant' || typeof lastMessage.content === 'string') {
      return prev;
    }

    const contentArray = lastMessage.content;
    const toolBlockIndex = contentArray.findIndex(
      (block) => block.type === 'tool_use' && block.tool?.id === toolId
    );

    if (toolBlockIndex === -1) {
      return prev;
    }

    const toolBlock = contentArray[toolBlockIndex];
    if (toolBlock.type !== 'tool_use' || !toolBlock.tool) {
      return prev;
    }

    const updatedContent = [...contentArray];
    updatedContent[toolBlockIndex] = {
      ...toolBlock,
      tool: { ...toolBlock.tool, ...updater(toolBlock.tool) }
    };

    return [...prev.slice(0, -1), { ...lastMessage, content: updatedContent }];
  });
}

function handleMessageChunk(data: ChatMessageChunkEvent): void {
  const state = getOrCreateStateInternal(data.chatId);
  state.lastError = null;

  updateMessages(data.chatId, (prev) => {
    const lastMessage = prev[prev.length - 1];
    if (lastMessage && lastMessage.role === 'assistant' && state.isStreaming) {
      const content = lastMessage.content;
      if (typeof content === 'string') {
        return [
          ...prev.slice(0, -1),
          {
            ...lastMessage,
            content: content + data.chunk
          }
        ];
      }

      const lastBlock = content[content.length - 1];
      if (lastBlock && lastBlock.type === 'text') {
        return [
          ...prev.slice(0, -1),
          {
            ...lastMessage,
            content: [
              ...content.slice(0, -1),
              { type: 'text', text: (lastBlock.text || '') + data.chunk }
            ]
          }
        ];
      }

      return [
        ...prev.slice(0, -1),
        {
          ...lastMessage,
          content: [...content, { type: 'text', text: data.chunk }]
        }
      ];
    }

    state.isStreaming = true;
    state.debugMessages = [];
    return [
      ...prev,
      {
        id: Date.now().toString(),
        role: 'assistant',
        content: data.chunk,
        timestamp: new Date()
      }
    ];
  });
}

function handleThinkingStart(data: ChatThinkingStartEvent): void {
  const state = getOrCreateStateInternal(data.chatId);
  updateMessages(data.chatId, (prev) => {
    const lastMessage = prev[prev.length - 1];
    const thinkingBlock = {
      type: 'thinking' as const,
      thinking: '',
      thinkingStreamIndex: data.index,
      thinkingStartedAt: Date.now()
    };

    if (lastMessage && lastMessage.role === 'assistant') {
      const content = lastMessage.content;
      const contentArray =
        typeof content === 'string' ? [{ type: 'text' as const, text: content }] : content;
      return [
        ...prev.slice(0, -1),
        {
          ...lastMessage,
          content: [...contentArray, thinkingBlock]
        }
      ];
    }

    state.isStreaming = true;
    state.debugMessages = [];
    return [
      ...prev,
      {
        id: Date.now().toString(),
        role: 'assistant',
        content: [thinkingBlock],
        timestamp: new Date()
      }
    ];
  });
}

function handleThinkingChunk(data: ChatThinkingChunkEvent): void {
  updateMessages(data.chatId, (prev) => {
    const lastMessage = prev[prev.length - 1];
    if (!lastMessage || lastMessage.role !== 'assistant' || typeof lastMessage.content === 'string') {
      return prev;
    }

    const contentArray = lastMessage.content;
    const thinkingBlockIndex = contentArray.findIndex(
      (block) =>
        block.type === 'thinking' &&
        block.thinkingStreamIndex === data.index &&
        !block.isComplete
    );

    if (thinkingBlockIndex === -1) {
      return prev;
    }

    const thinkingBlock = contentArray[thinkingBlockIndex];
    if (thinkingBlock.type !== 'thinking') {
      return prev;
    }

    const updatedContent = [...contentArray];
    updatedContent[thinkingBlockIndex] = {
      ...thinkingBlock,
      thinking: (thinkingBlock.thinking || '') + data.delta,
      thinkingStreamIndex: thinkingBlock.thinkingStreamIndex,
      isComplete: thinkingBlock.isComplete
    };

    return [
      ...prev.slice(0, -1),
      {
        ...lastMessage,
        content: updatedContent
      }
    ];
  });
}

function handleToolUseStart(tool: ChatToolUseStartEvent): void {
  window.electron.analytics.trackEvent({
    type: 'tool_used',
    timestamp: Date.now(),
    properties: { toolName: tool.name }
  });

  const state = getOrCreateStateInternal(tool.chatId);
  updateMessages(tool.chatId, (prev) => {
    const lastMessage = prev[prev.length - 1];
    const toolBlock = {
      type: 'tool_use' as const,
      tool: {
        id: tool.id,
        name: tool.name,
        input: tool.input,
        streamIndex: tool.streamIndex,
        inputJson: ''
      }
    };

    if (lastMessage && lastMessage.role === 'assistant') {
      const content = lastMessage.content;
      const contentArray =
        typeof content === 'string' ? [{ type: 'text' as const, text: content }] : content;
      return [
        ...prev.slice(0, -1),
        {
          ...lastMessage,
          content: [...contentArray, toolBlock]
        }
      ];
    }

    state.isStreaming = true;
    state.debugMessages = [];
    return [
      ...prev,
      {
        id: Date.now().toString(),
        role: 'assistant',
        content: [toolBlock],
        timestamp: new Date()
      }
    ];
  });
}

function handleToolInputDelta(data: ChatToolInputDeltaEvent): void {
  updateToolBlock(data.chatId, data.toolId, (tool) => {
    const newInputJson = (tool.inputJson || '') + data.delta;
    const parsedInput = parsePartialJson<ToolInput>(newInputJson);
    return { inputJson: newInputJson, parsedInput: parsedInput || tool.parsedInput };
  });
}

function handleContentBlockStop(data: ChatContentBlockStopEvent): void {
  updateMessages(data.chatId, (prev) => {
    const lastMessage = prev[prev.length - 1];
    if (!lastMessage || lastMessage.role !== 'assistant' || typeof lastMessage.content === 'string') {
      return prev;
    }

    const contentArray = lastMessage.content;
    const thinkingBlockIndex = contentArray.findIndex(
      (block) =>
        block.type === 'thinking' &&
        block.thinkingStreamIndex === data.index &&
        !block.isComplete
    );

    if (thinkingBlockIndex !== -1) {
      const thinkingBlock = contentArray[thinkingBlockIndex];
      if (thinkingBlock.type === 'thinking') {
        const updatedContent = [...contentArray];
        updatedContent[thinkingBlockIndex] = {
          ...thinkingBlock,
          isComplete: true,
          thinkingDurationMs:
            thinkingBlock.thinkingStartedAt ?
              Date.now() - thinkingBlock.thinkingStartedAt
            : undefined
        };

        return [
          ...prev.slice(0, -1),
          {
            ...lastMessage,
            content: updatedContent
          }
        ];
      }
    }

    const toolBlockIndex =
      data.toolId ?
        contentArray.findIndex(
          (block) => block.type === 'tool_use' && block.tool?.id === data.toolId
        )
      : contentArray.findIndex(
          (block) => block.type === 'tool_use' && block.tool?.streamIndex === data.index
        );

    if (toolBlockIndex === -1) {
      return prev;
    }

    const toolBlock = contentArray[toolBlockIndex];
    if (toolBlock.type !== 'tool_use' || !toolBlock.tool) {
      return prev;
    }

    const currentTool = toolBlock.tool;
    let parsedInput: ToolInput | undefined = currentTool.parsedInput;
    if (currentTool.inputJson) {
      try {
        parsedInput = JSON.parse(currentTool.inputJson) as ToolInput;
      } catch {
        const fallback = parsePartialJson<ToolInput>(currentTool.inputJson);
        parsedInput = fallback ?? currentTool.parsedInput;
      }
    }

    const updatedContent = [...contentArray];
    updatedContent[toolBlockIndex] = {
      ...toolBlock,
      tool: {
        ...currentTool,
        parsedInput
      }
    };

    return [
      ...prev.slice(0, -1),
      {
        ...lastMessage,
        content: updatedContent
      }
    ];
  });
}

function handleToolResultStart(data: ChatToolResultStartEvent): void {
  updateToolBlock(data.chatId, data.toolUseId, () => ({
    result: data.content,
    isError: data.isError
  }));
}

function handleToolResultDelta(data: ChatToolResultDeltaEvent): void {
  updateToolBlock(data.chatId, data.toolUseId, (tool) => ({
    result: (tool.result || '') + data.delta
  }));
}

function handleToolResultComplete(data: ChatToolResultCompleteEvent): void {
  updateToolBlock(data.chatId, data.toolUseId, () => ({
    result: data.content,
    isError: data.isError
  }));
}

function finalizeStream(
  chatId: string,
  analyticsType: AnalyticsEventType,
  lastError: string | null = null
): ChatState {
  const state = getOrCreateStateInternal(chatId);
  state.isStreaming = false;
  state.isLoading = false;
  state.retryStatus = null;
  state.backgroundTasks = new Map();
  state.lastError = lastError;
  window.electron.analytics.trackEvent({ type: analyticsType, timestamp: Date.now() });
  return state;
}

function handleMessageComplete(data: ChatLifecycleEvent): void {
  const state = finalizeStream(data.chatId, 'message_completed');

  if (state.debugMessages.length > 0) {
    updateMessages(data.chatId, (prev) => {
      const lastMessage = prev[prev.length - 1];
      if (lastMessage && lastMessage.role === 'assistant') {
        return [
          ...prev.slice(0, -1),
          appendDebugContent(lastMessage, state.debugMessages)
        ];
      }

      return [
        ...prev,
        {
          id: Date.now().toString(),
          role: 'assistant',
          content: state.debugMessages.join('\n'),
          timestamp: new Date()
        }
      ];
    });
  } else {
    notifySubscribers(state);
  }

  state.debugMessages = [];
}

function handleMessageStopped(data: ChatLifecycleEvent): void {
  const state = finalizeStream(data.chatId, 'message_stopped');

  updateMessages(data.chatId, (prev) => {
    const lastMessage = prev[prev.length - 1];
    if (lastMessage && lastMessage.role === 'assistant' && typeof lastMessage.content !== 'string') {
      let hasUpdates = false;
      let updatedContent = lastMessage.content.map((block) => {
        if (block.type === 'thinking' && !block.isComplete) {
          hasUpdates = true;
          return {
            ...block,
            isComplete: true,
            thinkingDurationMs:
              block.thinkingStartedAt ? Date.now() - block.thinkingStartedAt : undefined
          };
        }
        return block;
      });

      if (state.debugMessages.length > 0) {
        updatedContent = [
          ...updatedContent,
          {
            type: 'text' as const,
            text: `\n\n---\n**🔍 Debug Output:**\n\`\`\`\n${state.debugMessages.join('\n')}\n\`\`\`\n`
          }
        ];
        hasUpdates = true;
      }

      if (hasUpdates) {
        return [
          ...prev.slice(0, -1),
          {
            ...lastMessage,
            content: updatedContent
          }
        ];
      }
    }

    if (state.debugMessages.length > 0) {
      return [
        ...prev,
        {
          id: Date.now().toString(),
          role: 'assistant',
          content: state.debugMessages.join('\n'),
          timestamp: new Date()
        }
      ];
    }

    return prev;
  });

  state.debugMessages = [];
}

function handleMessageError(data: ChatMessageErrorEvent): void {
  const state = finalizeStream(data.chatId, 'message_error', data.error);

  updateMessages(data.chatId, (prev) => {
    let nextMessages = prev;
    const lastMessage = prev[prev.length - 1];
    if (state.debugMessages.length > 0 && lastMessage && lastMessage.role === 'assistant') {
      nextMessages = [
        ...prev.slice(0, -1),
        appendDebugContent(lastMessage, state.debugMessages)
      ];
    }

    const classification = classifyError(data.error);
    return [
      ...nextMessages,
      {
        id: Date.now().toString(),
        role: 'assistant',
        content: classification.message,
        timestamp: new Date(),
        errorMeta: {
          rawError: data.error,
          actionType: classification.actionType
        }
      }
    ];
  });

  state.debugMessages = [];
}

function handleRetryStatus(data: ChatRetryStatusEvent): void {
  const state = getOrCreateStateInternal(data.chatId);
  state.retryStatus = createRetryStatus(data);
  ensureRetryTicker();
  notifySubscribers(state);
}

function handleDebugMessage(data: ChatDebugMessageEvent): void {
  const state = getOrCreateStateInternal(data.chatId);
  if (!state.isStreaming) {
    return;
  }

  state.debugMessages = [...state.debugMessages, data.message];
}

function initGlobalListeners(): void {
  if (listenersInitialized) {
    return;
  }

  listenersInitialized = true;
  window.electron.chat.onMessageChunk(handleMessageChunk);
  window.electron.chat.onThinkingStart(handleThinkingStart);
  window.electron.chat.onThinkingChunk(handleThinkingChunk);
  window.electron.chat.onToolUseStart(handleToolUseStart);
  window.electron.chat.onToolInputDelta(handleToolInputDelta);
  window.electron.chat.onContentBlockStop(handleContentBlockStop);
  window.electron.chat.onToolResultStart(handleToolResultStart);
  window.electron.chat.onToolResultDelta(handleToolResultDelta);
  window.electron.chat.onToolResultComplete(handleToolResultComplete);
  window.electron.chat.onMessageComplete(handleMessageComplete);
  window.electron.chat.onMessageStopped(handleMessageStopped);
  window.electron.chat.onMessageError(handleMessageError);
  window.electron.chat.onRetryStatus(handleRetryStatus);
  window.electron.chat.onDebugMessage(handleDebugMessage);
  window.electron.chat.onSessionUpdated((data: ChatSessionUpdatedEvent) => {
    const state = getOrCreateStateInternal(data.chatId);
    state.sessionId = data.sessionId;
    if (state.messages.length > 0) {
      markDirty(data.chatId);
    }
    notifySubscribers(state);
  });
  window.electron.chat.onTaskProgress((data) => {
    if (!data.chatId) {
      return;
    }

    const state = getOrCreateStateInternal(data.chatId);
    const next = new Map(state.backgroundTasks);
    next.set(data.taskId, {
      taskId: data.taskId,
      toolUseId: data.toolUseId,
      description: data.description,
      status: 'running',
      totalTokens: data.totalTokens,
      toolUses: data.toolUses,
      durationMs: data.durationMs,
      lastToolName: data.lastToolName
    });
    state.backgroundTasks = next;
    notifySubscribers(state);
  });
  window.electron.chat.onTaskNotification((data) => {
    if (!data.chatId) {
      return;
    }

    const state = getOrCreateStateInternal(data.chatId);
    const next = new Map(state.backgroundTasks);
    next.set(data.taskId, {
      taskId: data.taskId,
      toolUseId: data.toolUseId,
      description: next.get(data.taskId)?.description || data.summary,
      status: data.status,
      totalTokens: data.totalTokens || next.get(data.taskId)?.totalTokens || 0,
      toolUses: data.toolUses || next.get(data.taskId)?.toolUses || 0,
      durationMs: data.durationMs || next.get(data.taskId)?.durationMs || 0,
      lastToolName: next.get(data.taskId)?.lastToolName,
      summary: data.summary,
      outputFile: data.outputFile
    });
    state.backgroundTasks = next;
    notifySubscribers(state);
  });
}

export function getOrCreateState(chatId: string): ChatState {
  initGlobalListeners();
  return getOrCreateStateInternal(chatId);
}

export function subscribeToChat(chatId: string, subscriber: () => void): () => void {
  const state = getOrCreateState(chatId);
  state.subscribers.add(subscriber);
  return () => {
    state.subscribers.delete(subscriber);
  };
}

export function getChatStateSnapshot(chatId: string): ChatState {
  return getOrCreateState(chatId);
}

export function subscribeToChatStore(subscriber: () => void): () => void {
  storeSubscribers.add(subscriber);
  return () => {
    storeSubscribers.delete(subscriber);
  };
}

export function setChatMessages(
  chatId: string,
  updater: MessageUpdater,
  options?: { markDirty?: boolean }
): void {
  const nextUpdater = typeof updater === 'function' ? updater : () => updater;
  updateMessages(chatId, nextUpdater, options?.markDirty ?? true);
}

export function setChatLoading(
  chatId: string,
  updater: BooleanUpdater,
  options?: { markDirty?: boolean }
): void {
  const state = getOrCreateState(chatId);
  state.isLoading = typeof updater === 'function' ? updater(state.isLoading) : updater;
  if (state.isLoading) {
    state.lastError = null;
  }
  if (options?.markDirty && state.messages.length > 0) {
    markDirty(chatId);
  }
  notifySubscribers(state);
}

export function replaceChatState(
  chatId: string,
  data: Partial<Pick<ChatState, 'messages' | 'isLoading' | 'isStreaming' | 'sessionId' | 'retryStatus' | 'lastError'>>
): void {
  const state = getOrCreateState(chatId);
  if (typeof data.messages !== 'undefined') state.messages = data.messages;
  if (typeof data.isLoading === 'boolean') state.isLoading = data.isLoading;
  if (typeof data.isStreaming === 'boolean') state.isStreaming = data.isStreaming;
  if (typeof data.sessionId !== 'undefined') state.sessionId = data.sessionId;
  if (typeof data.retryStatus !== 'undefined') state.retryStatus = data.retryStatus;
  if (typeof data.lastError !== 'undefined') state.lastError = data.lastError;
  state.debugMessages = [];
  state.backgroundTasks = new Map();
  state.isDirty = false;
  if (state.saveTimeoutId !== null) {
    window.clearTimeout(state.saveTimeoutId);
    state.saveTimeoutId = null;
  }
  notifySubscribers(state);
}

export function registerConversationMapping(conversationId: string, chatId: string): void {
  const previousChatId = conversationToChatId.get(conversationId);
  if (previousChatId && previousChatId !== chatId) {
    chatIdToConversation.delete(previousChatId);
  }

  const previousConversationId = chatIdToConversation.get(chatId);
  if (previousConversationId && previousConversationId !== conversationId) {
    conversationToChatId.delete(previousConversationId);
  }

  conversationToChatId.set(conversationId, chatId);
  chatIdToConversation.set(chatId, conversationId);
  schedulePersist(chatId);
}

export function getChatIdForConversation(conversationId: string): string | null {
  return conversationToChatId.get(conversationId) ?? null;
}

export function getConversationIdForChat(chatId: string): string | null {
  return chatIdToConversation.get(chatId) ?? null;
}

export function getConversationStatus(conversationId: string): 'idle' | 'running' | 'error' {
  const chatId = conversationToChatId.get(conversationId);
  if (!chatId) {
    return 'idle';
  }

  const state = chatStates.get(chatId);
  if (!state) {
    return 'idle';
  }

  if (state.lastError) {
    return 'error';
  }

  return state.isLoading ? 'running' : 'idle';
}

export async function destroyChatState(chatId: string): Promise<void> {
  const state = chatStates.get(chatId);
  if (!state) {
    return;
  }
  disposeChatState(chatId);
  storeSubscribers.forEach((subscriber) => subscriber());
}

export function markChatDirty(chatId: string): void {
  markDirty(chatId);
}
