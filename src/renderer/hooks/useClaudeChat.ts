import { useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import type { BackgroundTask } from '../../shared/types/background-task';
import type { RetryStatus, ToolUse } from '@/electron';
import type { Message, ToolInput } from '@/types/chat';
import { classifyError } from '@/utils/friendlyError';
import { parsePartialJson } from '@/utils/parsePartialJson';

const RETRY_DELAYS_MS = [2000, 4000, 8000] as const;

interface ActiveRetryStatus extends RetryStatus {
  nextRetryAt: number;
  secondsRemaining: number;
}

function createRetryStatus(status: RetryStatus): ActiveRetryStatus {
  return {
    ...status,
    nextRetryAt: Date.now() + status.retryInMs,
    secondsRemaining: Math.max(1, Math.ceil(status.retryInMs / 1000))
  };
}

export function useClaudeChat(): {
  messages: Message[];
  setMessages: Dispatch<SetStateAction<Message[]>>;
  isLoading: boolean;
  setIsLoading: Dispatch<SetStateAction<boolean>>;
  backgroundTasks: Map<string, BackgroundTask>;
  retryStatus: ActiveRetryStatus | null;
} {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [backgroundTasks, setBackgroundTasks] = useState<Map<string, BackgroundTask>>(new Map());
  const [retryStatus, setRetryStatus] = useState<ActiveRetryStatus | null>(null);
  const isStreamingRef = useRef(false);
  const debugMessagesRef = useRef<string[]>([]);

  useEffect(() => {
    if (!retryStatus) {
      return;
    }

    const timer = window.setInterval(() => {
      setRetryStatus((current) => {
        if (!current) {
          return null;
        }

        const remainingMs = current.nextRetryAt - Date.now();
        if (remainingMs > 0) {
          const nextSeconds = Math.max(1, Math.ceil(remainingMs / 1000));
          return nextSeconds === current.secondsRemaining ?
              current
            : { ...current, secondsRemaining: nextSeconds };
        }

        if (current.attempt >= current.maxAttempts) {
          return current.secondsRemaining === 0 ? current : { ...current, secondsRemaining: 0 };
        }

        const nextAttempt = current.attempt + 1;
        const nextDelay = RETRY_DELAYS_MS[nextAttempt - 1] ?? current.retryInMs;
        return createRetryStatus({
          attempt: nextAttempt,
          maxAttempts: current.maxAttempts,
          retryInMs: nextDelay
        });
      });
    }, 250);

    return () => window.clearInterval(timer);
  }, [retryStatus]);

  useEffect(() => {
    // Listen for streaming message chunks
    const unsubscribeMessageChunk = window.electron.chat.onMessageChunk((chunk: string) => {
      setMessages((prev) => {
        const lastMessage = prev[prev.length - 1];
        // Only append if last message is from assistant AND we're actively streaming
        // This prevents appending to completed messages from previous turns
        if (lastMessage && lastMessage.role === 'assistant' && isStreamingRef.current) {
          const content = lastMessage.content;
          if (typeof content === 'string') {
            return [
              ...prev.slice(0, -1),
              {
                ...lastMessage,
                content: content + chunk
              }
            ];
          } else {
            // Content is structured - append to last text block or create new one
            const lastBlock = content[content.length - 1];
            if (lastBlock && lastBlock.type === 'text') {
              return [
                ...prev.slice(0, -1),
                {
                  ...lastMessage,
                  content: [
                    ...content.slice(0, -1),
                    { type: 'text', text: (lastBlock.text || '') + chunk }
                  ]
                }
              ];
            } else {
              return [
                ...prev.slice(0, -1),
                {
                  ...lastMessage,
                  content: [...content, { type: 'text', text: chunk }]
                }
              ];
            }
          }
        }
        // Otherwise, create new assistant message and start streaming
        isStreamingRef.current = true;
        debugMessagesRef.current = []; // Clear debug accumulator for new response
        return [
          ...prev,
          {
            id: Date.now().toString(),
            role: 'assistant',
            content: chunk,
            timestamp: new Date()
          }
        ];
      });
    });

    // Listen for thinking block start
    const unsubscribeThinkingStart = window.electron.chat.onThinkingStart(
      (data: { index: number }) => {
        setMessages((prev) => {
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

          // No existing assistant message – start a new one so thinking can render
          isStreamingRef.current = true;
          debugMessagesRef.current = []; // Clear debug accumulator for new response
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
    );

    // Listen for thinking chunk deltas
    const unsubscribeThinkingChunk = window.electron.chat.onThinkingChunk(
      (data: { index: number; delta: string }) => {
        setMessages((prev) => {
          const lastMessage = prev[prev.length - 1];
          if (
            lastMessage &&
            lastMessage.role === 'assistant' &&
            typeof lastMessage.content !== 'string'
          ) {
            const contentArray = lastMessage.content;
            // Find incomplete thinking block by stream index (not array index)
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
              }
            }
          }
          return prev;
        });
      }
    );

    // Listen for tool use start
    const unsubscribeToolUseStart = window.electron.chat.onToolUseStart((tool: ToolUse) => {
      window.electron.analytics.trackEvent({
        type: 'tool_used',
        timestamp: Date.now(),
        properties: { toolName: tool.name }
      });
      setMessages((prev) => {
        const lastMessage = prev[prev.length - 1];
        const toolBlock = {
          type: 'tool_use' as const,
          tool: {
            ...tool,
            // Don't stringify tool.input here - it gets built up via deltas
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

        // No existing assistant message – start a new one so the tool can render
        isStreamingRef.current = true;
        debugMessagesRef.current = []; // Clear debug accumulator for new response
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
    });

    // Listen for tool input deltas - accumulate the raw string and attempt incremental parsing
    const unsubscribeToolInputDelta = window.electron.chat.onToolInputDelta(
      (data: { index: number; toolId: string; delta: string }) => {
        setMessages((prev) => {
          const lastMessage = prev[prev.length - 1];
          if (
            lastMessage &&
            lastMessage.role === 'assistant' &&
            typeof lastMessage.content !== 'string'
          ) {
            const contentArray = lastMessage.content;
            // Match by tool ID instead of streamIndex for better delineation
            const toolBlockIndex = contentArray.findIndex(
              (block) => block.type === 'tool_use' && block.tool?.id === data.toolId
            );

            if (toolBlockIndex !== -1) {
              const toolBlock = contentArray[toolBlockIndex];
              if (toolBlock.type === 'tool_use' && toolBlock.tool) {
                const currentTool = toolBlock.tool;
                const newInputJson = (currentTool.inputJson || '') + data.delta;

                // Attempt to parse the accumulated JSON incrementally
                const parsedInput = parsePartialJson<ToolInput>(newInputJson);

                const updatedContent = [...contentArray];
                updatedContent[toolBlockIndex] = {
                  ...toolBlock,
                  tool: {
                    ...currentTool,
                    inputJson: newInputJson,
                    // Update parsedInput if we successfully parsed something
                    parsedInput: parsedInput || currentTool.parsedInput
                  }
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
          }
          return prev;
        });
      }
    );

    // Listen for content block stop - parse the accumulated inputJson or mark thinking complete
    const unsubscribeContentBlockStop = window.electron.chat.onContentBlockStop(
      (data: { index: number; toolId?: string }) => {
        setMessages((prev) => {
          const lastMessage = prev[prev.length - 1];
          if (
            lastMessage &&
            lastMessage.role === 'assistant' &&
            typeof lastMessage.content !== 'string'
          ) {
            const contentArray = lastMessage.content;

            // First check if this is a thinking block
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

            // Otherwise check if this is a tool block
            // Match by tool ID (if available) for consistency with onToolInputDelta
            // Fall back to streamIndex for non-tool blocks or if toolId is missing
            const toolBlockIndex =
              data.toolId ?
                contentArray.findIndex(
                  (block) => block.type === 'tool_use' && block.tool?.id === data.toolId
                )
              : contentArray.findIndex(
                  (block) => block.type === 'tool_use' && block.tool?.streamIndex === data.index
                );

            if (toolBlockIndex !== -1) {
              const toolBlock = contentArray[toolBlockIndex];
              if (toolBlock.type === 'tool_use' && toolBlock.tool) {
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
              }
            }
          }
          return prev;
        });
      }
    );

    // Listen for tool result start
    const unsubscribeToolResultStart = window.electron.chat.onToolResultStart(
      (data: { toolUseId: string; content: string; isError: boolean }) => {
        setMessages((prev) => {
          const lastMessage = prev[prev.length - 1];
          if (
            lastMessage &&
            lastMessage.role === 'assistant' &&
            typeof lastMessage.content !== 'string'
          ) {
            const contentArray = lastMessage.content;
            const toolBlockIndex = contentArray.findIndex(
              (block) => block.type === 'tool_use' && block.tool?.id === data.toolUseId
            );

            if (toolBlockIndex !== -1) {
              const toolBlock = contentArray[toolBlockIndex];
              if (toolBlock.type === 'tool_use' && toolBlock.tool) {
                const updatedContent = [...contentArray];
                updatedContent[toolBlockIndex] = {
                  ...toolBlock,
                  tool: {
                    ...toolBlock.tool,
                    result: data.content,
                    isError: data.isError
                  }
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
          }
          return prev;
        });
      }
    );

    // Listen for tool result deltas
    const unsubscribeToolResultDelta = window.electron.chat.onToolResultDelta(
      (data: { toolUseId: string; delta: string }) => {
        setMessages((prev) => {
          const lastMessage = prev[prev.length - 1];
          if (
            lastMessage &&
            lastMessage.role === 'assistant' &&
            typeof lastMessage.content !== 'string'
          ) {
            const contentArray = lastMessage.content;
            const toolBlockIndex = contentArray.findIndex(
              (block) => block.type === 'tool_use' && block.tool?.id === data.toolUseId
            );

            if (toolBlockIndex !== -1) {
              const toolBlock = contentArray[toolBlockIndex];
              if (toolBlock.type === 'tool_use' && toolBlock.tool) {
                const updatedContent = [...contentArray];
                updatedContent[toolBlockIndex] = {
                  ...toolBlock,
                  tool: {
                    ...toolBlock.tool,
                    result: (toolBlock.tool.result || '') + data.delta
                  }
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
          }
          return prev;
        });
      }
    );

    // Listen for tool result complete
    const unsubscribeToolResultComplete = window.electron.chat.onToolResultComplete(
      (data: { toolUseId: string; content: string; isError?: boolean }) => {
        setMessages((prev) => {
          const lastMessage = prev[prev.length - 1];
          if (
            lastMessage &&
            lastMessage.role === 'assistant' &&
            typeof lastMessage.content !== 'string'
          ) {
            const contentArray = lastMessage.content;
            const toolBlockIndex = contentArray.findIndex(
              (block) => block.type === 'tool_use' && block.tool?.id === data.toolUseId
            );

            if (toolBlockIndex !== -1) {
              const toolBlock = contentArray[toolBlockIndex];
              if (toolBlock.type === 'tool_use' && toolBlock.tool) {
                const updatedContent = [...contentArray];
                updatedContent[toolBlockIndex] = {
                  ...toolBlock,
                  tool: {
                    ...toolBlock.tool,
                    result: data.content,
                    isError: data.isError
                  }
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
          }
          return prev;
        });
      }
    );

    // Listen for message completion
    const unsubscribeMessageComplete = window.electron.chat.onMessageComplete(() => {
      isStreamingRef.current = false;
      setIsLoading(false);
      setRetryStatus(null);
      // Clear background tasks — session turn is done
      setBackgroundTasks(new Map());
      window.electron.analytics.trackEvent({ type: 'message_completed', timestamp: Date.now() });

      // Append all accumulated debug messages when response completes
      if (debugMessagesRef.current.length > 0) {
        const accumulatedDebug = debugMessagesRef.current.join('\n');
        debugMessagesRef.current = []; // Clear accumulator

        setMessages((prev) => {
          const lastMessage = prev[prev.length - 1];
          const debugContent = `\n\n---\n**🔍 Debug Output:**\n\`\`\`\n${accumulatedDebug}\n\`\`\`\n`;

          if (lastMessage && lastMessage.role === 'assistant') {
            const content = lastMessage.content;
            if (typeof content === 'string') {
              // Append debug message to string content
              return [
                ...prev.slice(0, -1),
                {
                  ...lastMessage,
                  content: content + debugContent
                }
              ];
            } else {
              // Content is structured - append debug block
              return [
                ...prev.slice(0, -1),
                {
                  ...lastMessage,
                  content: [
                    ...content,
                    {
                      type: 'text' as const,
                      text: debugContent
                    }
                  ]
                }
              ];
            }
          }
          // No existing assistant message - create new one for debug
          return [
            ...prev,
            {
              id: Date.now().toString(),
              role: 'assistant',
              content: debugContent.trim(),
              timestamp: new Date()
            }
          ];
        });
      }
    });

    const unsubscribeMessageStopped = window.electron.chat.onMessageStopped(() => {
      isStreamingRef.current = false;
      setIsLoading(false);
      setRetryStatus(null);
      // Clear background tasks — session was interrupted
      setBackgroundTasks(new Map());
      window.electron.analytics.trackEvent({ type: 'message_stopped', timestamp: Date.now() });

      // Get accumulated debug messages
      const accumulatedDebug =
        debugMessagesRef.current.length > 0 ? debugMessagesRef.current.join('\n') : null;
      debugMessagesRef.current = []; // Clear accumulator

      setMessages((prev) => {
        const lastMessage = prev[prev.length - 1];
        if (
          lastMessage &&
          lastMessage.role === 'assistant' &&
          typeof lastMessage.content !== 'string'
        ) {
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

          // Append debug messages if any were accumulated
          if (accumulatedDebug) {
            const debugContent = `\n\n---\n**🔍 Debug Output:**\n\`\`\`\n${accumulatedDebug}\n\`\`\`\n`;
            updatedContent = [
              ...updatedContent,
              {
                type: 'text' as const,
                text: debugContent
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
        } else if (accumulatedDebug) {
          // No existing assistant message but we have debug messages
          const debugContent = `\n\n---\n**🔍 Debug Output:**\n\`\`\`\n${accumulatedDebug}\n\`\`\`\n`;
          return [
            ...prev,
            {
              id: Date.now().toString(),
              role: 'assistant',
              content: debugContent.trim(),
              timestamp: new Date()
            }
          ];
        }
        return prev;
      });
    });

    // Listen for errors
    const unsubscribeMessageError = window.electron.chat.onMessageError((error: string) => {
      isStreamingRef.current = false;
      setRetryStatus(null);
      // Clear background tasks — session errored
      setBackgroundTasks(new Map());
      window.electron.analytics.trackEvent({ type: 'message_error', timestamp: Date.now() });

      // Append all accumulated debug messages when error occurs
      if (debugMessagesRef.current.length > 0) {
        const accumulatedDebug = debugMessagesRef.current.join('\n');
        debugMessagesRef.current = []; // Clear accumulator

        setMessages((prev) => {
          const lastMessage = prev[prev.length - 1];
          const debugContent = `\n\n---\n**🔍 Debug Output:**\n\`\`\`\n${accumulatedDebug}\n\`\`\`\n`;

          if (lastMessage && lastMessage.role === 'assistant') {
            const content = lastMessage.content;
            if (typeof content === 'string') {
              return [
                ...prev.slice(0, -1),
                {
                  ...lastMessage,
                  content: content + debugContent
                }
              ];
            } else {
              return [
                ...prev.slice(0, -1),
                {
                  ...lastMessage,
                  content: [
                    ...content,
                    {
                      type: 'text' as const,
                      text: debugContent
                    }
                  ]
                }
              ];
            }
          }
          return prev;
        });
      }

      const classification = classifyError(error);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: 'assistant',
          content: classification.message,
          timestamp: new Date(),
          errorMeta: {
            rawError: error,
            actionType: classification.actionType
          }
        }
      ]);
      setIsLoading(false);
    });

    const unsubscribeRetryStatus = window.electron.chat.onRetryStatus((status: RetryStatus) => {
      setRetryStatus(createRetryStatus(status));
    });

    // Listen for debug messages (stderr from Claude Code process)
    // Accumulate debug messages during streaming - they'll be appended when response completes
    const unsubscribeDebugMessage = window.electron.chat.onDebugMessage((message: string) => {
      // Only accumulate if we're actively streaming
      if (isStreamingRef.current) {
        debugMessagesRef.current.push(message);
      }
    });

    // Listen for background task progress
    const unsubscribeTaskProgress = window.electron.chat.onTaskProgress((data) => {
      setBackgroundTasks((prev) => {
        const next = new Map(prev);
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
        return next;
      });
    });

    // Listen for background task notifications (completed/failed/stopped)
    const unsubscribeTaskNotification = window.electron.chat.onTaskNotification((data) => {
      setBackgroundTasks((prev) => {
        const next = new Map(prev);
        const existing = next.get(data.taskId);
        next.set(data.taskId, {
          taskId: data.taskId,
          toolUseId: data.toolUseId,
          description: existing?.description ?? '',
          status: data.status,
          totalTokens: data.totalTokens ?? existing?.totalTokens ?? 0,
          toolUses: data.toolUses ?? existing?.toolUses ?? 0,
          durationMs: data.durationMs ?? existing?.durationMs ?? 0,
          lastToolName: existing?.lastToolName,
          summary: data.summary,
          outputFile: data.outputFile
        });
        return next;
      });
    });

    // Cleanup function to remove all event listeners
    return () => {
      unsubscribeMessageChunk();
      unsubscribeThinkingStart();
      unsubscribeThinkingChunk();
      unsubscribeToolUseStart();
      unsubscribeToolInputDelta();
      unsubscribeContentBlockStop();
      unsubscribeToolResultStart();
      unsubscribeToolResultDelta();
      unsubscribeToolResultComplete();
      unsubscribeMessageComplete();
      unsubscribeMessageStopped();
      unsubscribeMessageError();
      unsubscribeRetryStatus();
      unsubscribeDebugMessage();
      unsubscribeTaskProgress();
      unsubscribeTaskNotification();
    };
  }, []);

  return {
    messages,
    setMessages,
    isLoading,
    setIsLoading,
    backgroundTasks,
    retryStatus
  };
}
