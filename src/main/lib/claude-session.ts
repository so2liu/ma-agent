import { existsSync } from 'fs';
import { createRequire } from 'module';
import { query, type Query } from '@anthropic-ai/claude-agent-sdk';
import type { BrowserWindow } from 'electron';

import { DEFAULT_MODEL_IDS, type ChatModelPreference } from '../../shared/types/ipc';
import {
  buildClaudeSessionEnv,
  getApiKey,
  getChatModelPreferenceSetting,
  getCustomModelId,
  getCustomModelIds,
  getDebugMode,
  getWorkspaceDir,
  setChatModelPreferenceSetting
} from './config';
import { sendChatEvent } from './ipc-utils';
import { isScheduledTaskExecuting } from './schedule-state';
import { endSessionLog, logSessionEvent, startSessionLog } from './session-logger';
import { sessionManager, type ManagedSession } from './session-manager';

const requireModule = createRequire(import.meta.url);
const RETRY_BACKOFF_MS = [2000, 4000, 8000] as const;
const RATE_LIMIT_NOTICE_DEBOUNCE_MS = 5000;

export const MODEL_BY_PREFERENCE = DEFAULT_MODEL_IDS;

let currentModelPreference: ChatModelPreference = getChatModelPreferenceSetting();

export function resolveClaudeCodeCli(): string {
  const cliPath = requireModule.resolve('@anthropic-ai/claude-agent-sdk/cli.js');
  if (cliPath.includes('app.asar')) {
    const unpackedPath = cliPath.replace('app.asar', 'app.asar.unpacked');
    if (existsSync(unpackedPath)) {
      return unpackedPath;
    }
  }
  return cliPath;
}

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

function resetRateLimitTracking(session: ManagedSession): void {
  session.lastRateLimitNoticeAt = 0;
  session.rateLimitAttempt = 0;
}

export function getModelIdForPreference(
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

  return MODEL_BY_PREFERENCE[preference] ?? DEFAULT_MODEL_IDS.fast;
}

export function getCurrentModelPreference(): ChatModelPreference {
  return currentModelPreference;
}

export async function setChatModelPreference(preference: ChatModelPreference): Promise<void> {
  currentModelPreference = preference;
  setChatModelPreferenceSetting(currentModelPreference);
}

export async function applyChatModelPreference(
  chatId: string,
  preference: ChatModelPreference = currentModelPreference
): Promise<void> {
  const session = sessionManager.get(chatId);
  if (!session?.querySession) {
    return;
  }

  try {
    await session.querySession.setModel(getModelIdForPreference(preference));
  } catch (error) {
    console.error(`Failed to update Claude model preference for chat ${chatId}:`, error);
    throw error;
  }
}

export function isSessionActive(chatId?: string): boolean {
  if (chatId) {
    const session = sessionManager.get(chatId);
    return Boolean(session?.isProcessing || session?.querySession);
  }

  return sessionManager.isAnyChatActive() || isScheduledTaskExecuting();
}

export async function interruptCurrentResponse(
  mainWindow: BrowserWindow | null,
  chatId: string
): Promise<boolean> {
  const session = sessionManager.get(chatId);
  if (!session?.querySession) {
    return false;
  }

  if (session.isInterruptingResponse) {
    return true;
  }

  session.isInterruptingResponse = true;
  try {
    await session.querySession.interrupt();
    sendChatEvent(mainWindow, 'chat:message-stopped', chatId);
    return true;
  } catch (error) {
    console.error(`Failed to interrupt current response for chat ${chatId}:`, error);
    throw error;
  } finally {
    session.isInterruptingResponse = false;
  }
}

export async function resetSession(chatId: string, resumeSessionId?: string | null): Promise<void> {
  const session = sessionManager.getOrCreate(chatId);

  session.sessionGeneration += 1;
  session.shouldAbortSession = true;
  sessionManager.abortGenerator(session);
  sessionManager.clearMessageQueue(session);
  sessionManager.setSessionId(session, resumeSessionId ?? null);
  session.pendingResumeSessionId = resumeSessionId ?? null;

  if (session.querySession) {
    try {
      await session.querySession.interrupt();
    } catch {
      // Ignore interrupt failures during reset.
    }
  }

  if (session.sessionTerminationPromise) {
    await Promise.race([
      session.sessionTerminationPromise,
      new Promise<void>((resolve) => setTimeout(resolve, 3000))
    ]);
  }

  session.querySession = null;
  session.isProcessing = false;
  session.sessionTerminationPromise = null;
  session.resolveTermination = null;
}

// Start streaming session
export async function startStreamingSession(
  mainWindow: BrowserWindow | null,
  chatId: string
): Promise<void> {
  const session = sessionManager.getOrCreate(chatId);

  if (session.sessionTerminationPromise) {
    await session.sessionTerminationPromise;
  }

  if (session.isProcessing || session.querySession) {
    return;
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('API key is not configured');
  }

  session.shouldAbortSession = false;
  sessionManager.resetAbortFlag(session);
  session.isProcessing = true;
  session.streamIndexToToolId.clear();
  resetRateLimitTracking(session);
  const myGeneration = session.sessionGeneration;

  session.sessionTerminationPromise = new Promise((resolve) => {
    session.resolveTermination = resolve;
  });

  try {
    const env = buildClaudeSessionEnv();
    env.ANTHROPIC_API_KEY = apiKey;

    const resumeSessionId = session.pendingResumeSessionId;
    const isResumedSession = typeof resumeSessionId === 'string' && resumeSessionId.length > 0;
    session.pendingResumeSessionId = null;

    const modelId = getModelIdForPreference();

    session.querySession = query({
      prompt: session.messageGenerator(),
      options: {
        model: modelId,
        maxThinkingTokens: 32_000,
        settingSources: ['project'],
        permissionMode: 'acceptEdits',
        allowedTools: ['Bash', 'WebFetch', 'WebSearch', 'Skill'],
        pathToClaudeCodeExecutable: resolveClaudeCodeCli(),
        executable: process.execPath as 'node',
        executableArgs: ['--no-warnings'],
        env: { ...env, ELECTRON_RUN_AS_NODE: '1' },
        stderr: (message: string) => {
          if (!mainWindow || mainWindow.isDestroyed()) {
            return;
          }

          const isSpawnInfo = /^Spawning Claude Code/i.test(message.trim());
          if (isSpawnInfo) {
            if (getDebugMode()) {
              sendChatEvent(mainWindow, 'chat:debug-message', chatId, { message });
            }
            return;
          }

          const isError =
            /rate.?limit|429|401|403|5\d{2}|error|ECONNREFUSED|ETIMEDOUT|unauthorized|forbidden/i.test(
              message
            );
          if (isError) {
            const trimmedMessage = message.trim();
            const isRateLimit = /rate.?limit|429/i.test(trimmedMessage);

            if (isRateLimit) {
              const now = Date.now();
              if (
                session.rateLimitAttempt === 0 ||
                now - session.lastRateLimitNoticeAt >= RATE_LIMIT_NOTICE_DEBOUNCE_MS
              ) {
                session.rateLimitAttempt = Math.min(
                  session.rateLimitAttempt + 1,
                  RETRY_BACKOFF_MS.length
                );
                session.lastRateLimitNoticeAt = now;
                sendChatEvent(mainWindow, 'chat:retry-status', chatId, {
                  attempt: session.rateLimitAttempt,
                  maxAttempts: RETRY_BACKOFF_MS.length,
                  retryInMs: RETRY_BACKOFF_MS[session.rateLimitAttempt - 1]
                });
              }
            } else {
              resetRateLimitTracking(session);
              sendChatEvent(mainWindow, 'chat:message-error', chatId, {
                error: trimmedMessage
              });
            }
          }

          if (getDebugMode()) {
            sendChatEvent(mainWindow, 'chat:debug-message', chatId, { message });
          }
        },
        systemPrompt: {
          type: 'preset',
          preset: 'claude_code',
          append: SYSTEM_PROMPT_APPEND
        },
        cwd: getWorkspaceDir(),
        includePartialMessages: true,
        ...(isResumedSession && { resume: resumeSessionId! })
      }
    }) as Query;

    if (getDebugMode()) {
      startSessionLog(isResumedSession ? resumeSessionId! : `new-${Date.now()}`);
    }

    for await (const sdkMessage of session.querySession) {
      if (session.shouldAbortSession || myGeneration !== session.sessionGeneration) {
        break;
      }

      if (!mainWindow || mainWindow.isDestroyed()) {
        break;
      }

      logSessionEvent(sdkMessage);

      if (sdkMessage.type === 'stream_event') {
        const streamEvent = sdkMessage.event;
        if (streamEvent.type === 'content_block_delta') {
          if (streamEvent.delta.type === 'text_delta') {
            sendChatEvent(mainWindow, 'chat:message-chunk', chatId, {
              chunk: streamEvent.delta.text
            });
          } else if (streamEvent.delta.type === 'thinking_delta') {
            sendChatEvent(mainWindow, 'chat:thinking-chunk', chatId, {
              index: streamEvent.index,
              delta: streamEvent.delta.thinking
            });
          } else if (streamEvent.delta.type === 'input_json_delta') {
            const toolId = session.streamIndexToToolId.get(streamEvent.index);
            sendChatEvent(mainWindow, 'chat:tool-input-delta', chatId, {
              index: streamEvent.index,
              toolId: toolId || '',
              delta: streamEvent.delta.partial_json
            });
          }
        } else if (streamEvent.type === 'content_block_start') {
          if (streamEvent.content_block.type === 'thinking') {
            sendChatEvent(mainWindow, 'chat:thinking-start', chatId, {
              index: streamEvent.index
            });
          } else if (streamEvent.content_block.type === 'tool_use') {
            session.streamIndexToToolId.set(streamEvent.index, streamEvent.content_block.id);

            sendChatEvent(mainWindow, 'chat:tool-use-start', chatId, {
              id: streamEvent.content_block.id,
              name: streamEvent.content_block.name,
              input: streamEvent.content_block.input || {},
              streamIndex: streamEvent.index
            });
          } else if (
            (streamEvent.content_block.type === 'web_search_tool_result' ||
              streamEvent.content_block.type === 'web_fetch_tool_result' ||
              streamEvent.content_block.type === 'code_execution_tool_result' ||
              streamEvent.content_block.type === 'bash_code_execution_tool_result' ||
              streamEvent.content_block.type === 'text_editor_code_execution_tool_result' ||
              streamEvent.content_block.type === 'mcp_tool_result') &&
            'tool_use_id' in streamEvent.content_block
          ) {
            const toolResultBlock = streamEvent.content_block as {
              tool_use_id: string;
              content?: string | unknown;
              is_error?: boolean;
            };

            let contentStr = '';
            if (typeof toolResultBlock.content === 'string') {
              contentStr = toolResultBlock.content;
            } else if (toolResultBlock.content !== null && toolResultBlock.content !== undefined) {
              contentStr = JSON.stringify(toolResultBlock.content, null, 2);
            }

            if (contentStr) {
              sendChatEvent(mainWindow, 'chat:tool-result-start', chatId, {
                toolUseId: toolResultBlock.tool_use_id,
                content: contentStr,
                isError: toolResultBlock.is_error || false
              });
            }
          }
        } else if (streamEvent.type === 'content_block_stop') {
          const toolId = session.streamIndexToToolId.get(streamEvent.index);
          sendChatEvent(mainWindow, 'chat:content-block-stop', chatId, {
            index: streamEvent.index,
            toolId: toolId || undefined
          });
        }
      } else if (sdkMessage.type === 'assistant') {
        const assistantMessage = sdkMessage.message;
        if (assistantMessage.content) {
          for (const block of assistantMessage.content) {
            if (
              typeof block === 'object' &&
              block !== null &&
              'tool_use_id' in block &&
              'content' in block
            ) {
              const toolResultBlock = block as {
                tool_use_id: string;
                content: string | unknown[] | unknown;
                is_error?: boolean;
              };

              let contentStr: string;
              if (typeof toolResultBlock.content === 'string') {
                contentStr = toolResultBlock.content;
              } else if (Array.isArray(toolResultBlock.content)) {
                contentStr = toolResultBlock.content
                  .map((contentItem) => {
                    if (typeof contentItem === 'string') {
                      return contentItem;
                    }
                    if (typeof contentItem === 'object' && contentItem !== null) {
                      if ('text' in contentItem && typeof contentItem.text === 'string') {
                        return contentItem.text;
                      }
                      if ('type' in contentItem && contentItem.type === 'text' && 'text' in contentItem) {
                        return String(contentItem.text);
                      }
                      return JSON.stringify(contentItem, null, 2);
                    }
                    return String(contentItem);
                  })
                  .join('\n');
              } else if (
                typeof toolResultBlock.content === 'object' &&
                toolResultBlock.content !== null
              ) {
                contentStr = JSON.stringify(toolResultBlock.content, null, 2);
              } else {
                contentStr = String(toolResultBlock.content);
              }

              sendChatEvent(mainWindow, 'chat:tool-result-complete', chatId, {
                toolUseId: toolResultBlock.tool_use_id,
                content: contentStr,
                isError: toolResultBlock.is_error || false
              });
            }
          }
        }
      } else if (sdkMessage.type === 'result') {
        sendChatEvent(mainWindow, 'chat:message-complete', chatId);
      } else if (sdkMessage.type === 'system') {
        if (sdkMessage.subtype === 'init') {
          const sessionIdFromSdk = sdkMessage.session_id;
          if (sessionIdFromSdk) {
            sessionManager.setSessionId(session, sessionIdFromSdk);
            sendChatEvent(mainWindow, 'chat:session-updated', chatId, {
              sessionId: sessionIdFromSdk,
              resumed: isResumedSession
            });
          }
        } else if ((sdkMessage.subtype as string) === 'task_progress') {
          const msg = sdkMessage as unknown as {
            task_id: string;
            tool_use_id?: string;
            description: string;
            usage: { total_tokens: number; tool_uses: number; duration_ms: number };
            last_tool_name?: string;
          };
          sendChatEvent(mainWindow, 'chat:task-progress', chatId, {
            taskId: msg.task_id,
            toolUseId: msg.tool_use_id,
            description: msg.description,
            totalTokens: msg.usage.total_tokens,
            toolUses: msg.usage.tool_uses,
            durationMs: msg.usage.duration_ms,
            lastToolName: msg.last_tool_name
          });
        } else if ((sdkMessage.subtype as string) === 'task_notification') {
          const msg = sdkMessage as unknown as {
            task_id: string;
            tool_use_id?: string;
            status: 'completed' | 'failed' | 'stopped';
            output_file: string;
            summary: string;
            usage?: { total_tokens: number; tool_uses: number; duration_ms: number };
          };
          sendChatEvent(mainWindow, 'chat:task-notification', chatId, {
            taskId: msg.task_id,
            toolUseId: msg.tool_use_id,
            status: msg.status,
            outputFile: msg.output_file,
            summary: msg.summary,
            totalTokens: msg.usage?.total_tokens,
            toolUses: msg.usage?.tool_uses,
            durationMs: msg.usage?.duration_ms
          });
        }
      }
    }
  } catch (error) {
    console.error(`Error in streaming session for chat ${chatId}:`, error);
    sessionManager.clearMessageQueue(session);
    resetRateLimitTracking(session);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    sendChatEvent(mainWindow, 'chat:message-error', chatId, { error: errorMessage });
  } finally {
    resetRateLimitTracking(session);
    endSessionLog();
    session.isProcessing = false;
    session.querySession = null;
    session.resolveTermination?.();
    session.resolveTermination = null;
    session.sessionTerminationPromise = null;

    if (session.messageQueue.length > 0) {
      startStreamingSession(mainWindow, chatId).catch((error) => {
        console.error(`Failed to restart session for pending messages in chat ${chatId}:`, error);
      });
    }
  }
}
