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
import {
  abortGenerator,
  clearMessageQueue,
  messageGenerator,
  regenerateSessionId,
  resetAbortFlag,
  setSessionId
} from './message-queue';
import { isScheduledTaskExecuting } from './schedule-state';
import { endSessionLog, logSessionEvent, startSessionLog } from './session-logger';

const requireModule = createRequire(import.meta.url);

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

let querySession: Query | null = null;
let isProcessing = false;
let shouldAbortSession = false;
let sessionTerminationPromise: Promise<void> | null = null;
let isInterruptingResponse = false;
// Map stream index to tool ID for current message
const streamIndexToToolId: Map<number, string> = new Map();
let pendingResumeSessionId: string | null = null;

export function getModelIdForPreference(preference: ChatModelPreference = currentModelPreference): string {
  // Per-tier custom model ID (set in Settings > 模型配置)
  const customModelIds = getCustomModelIds();
  const perTierCustom = customModelIds[preference]?.trim();
  if (perTierCustom) {
    return perTierCustom;
  }
  // Legacy single custom model override (developer info, kept for backward compat)
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
  if (preference === currentModelPreference) {
    return;
  }

  const previousPreference = currentModelPreference;
  currentModelPreference = preference;

  if (querySession) {
    try {
      await querySession.setModel(getModelIdForPreference(preference));
    } catch (error) {
      currentModelPreference = previousPreference;
      console.error('Failed to update Claude model preference:', error);
      throw error;
    }
  }

  setChatModelPreferenceSetting(currentModelPreference);
}

export function isSessionActive(): boolean {
  return isProcessing || querySession !== null || isScheduledTaskExecuting();
}

export async function interruptCurrentResponse(mainWindow: BrowserWindow | null): Promise<boolean> {
  if (!querySession) {
    return false;
  }

  if (isInterruptingResponse) {
    return true;
  }

  isInterruptingResponse = true;
  try {
    await querySession.interrupt();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('chat:message-stopped');
    }
    return true;
  } catch (error) {
    console.error('Failed to interrupt current response:', error);
    throw error;
  } finally {
    isInterruptingResponse = false;
  }
}

export async function resetSession(resumeSessionId?: string | null): Promise<void> {
  // Signal any running session to abort
  shouldAbortSession = true;

  // Signal the message generator to abort
  abortGenerator();

  // Clear the message queue to prevent pending messages from being sent
  clearMessageQueue();

  // Generate or set the appropriate session ID for the next conversation
  regenerateSessionId(resumeSessionId ?? null);
  pendingResumeSessionId = resumeSessionId ?? null;

  // Wait for the current session to fully terminate before proceeding
  if (sessionTerminationPromise) {
    await sessionTerminationPromise;
  }

  // Clear session state
  querySession = null;
  isProcessing = false;
  sessionTerminationPromise = null;
}

// Start streaming session
export async function startStreamingSession(mainWindow: BrowserWindow | null): Promise<void> {
  // Wait for any pending session termination to complete first
  if (sessionTerminationPromise) {
    await sessionTerminationPromise;
  }

  if (isProcessing || querySession) {
    return;
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('API key is not configured');
  }

  // Reset abort flags for new session
  shouldAbortSession = false;
  resetAbortFlag();
  isProcessing = true;
  // Clear stream index mapping for new session
  streamIndexToToolId.clear();

  // Create a promise that resolves when this session terminates
  let resolveTermination: () => void;
  sessionTerminationPromise = new Promise((resolve) => {
    resolveTermination = resolve;
  });

  try {
    // Use the shared environment builder to ensure consistency across Electron app,
    // Claude Agent SDK, and debug panel
    const env = buildClaudeSessionEnv();

    // Ensure API key is set (buildClaudeSessionEnv uses getApiKey which may return null)
    // but we've already checked it exists above, so set it explicitly
    env.ANTHROPIC_API_KEY = apiKey;

    const resumeSessionId = pendingResumeSessionId;
    const isResumedSession = typeof resumeSessionId === 'string' && resumeSessionId.length > 0;
    pendingResumeSessionId = null;

    const modelId = getModelIdForPreference();

    querySession = query({
      prompt: messageGenerator(),
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
          if (mainWindow && !mainWindow.isDestroyed()) {
            // Skip SDK spawn/debug info lines that are not real errors
            const isSpawnInfo = /^Spawning Claude Code/i.test(message.trim());
            if (isSpawnInfo) {
              if (getDebugMode()) {
                mainWindow.webContents.send('chat:debug-message', message);
              }
              return;
            }
            const isError =
              /rate.?limit|429|401|403|5\d{2}|error|ECONNREFUSED|ETIMEDOUT|unauthorized|forbidden/i.test(
                message
              );
            if (isError) {
              mainWindow.webContents.send('chat:message-error', message.trim());
            }
            // Send debug messages if debug mode is enabled
            if (getDebugMode()) {
              mainWindow.webContents.send('chat:debug-message', message);
            }
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
    });

    if (getDebugMode()) {
      startSessionLog(isResumedSession ? resumeSessionId! : `new-${Date.now()}`);
    }

    // Process streaming responses
    for await (const sdkMessage of querySession) {
      // Check if session should be aborted
      if (shouldAbortSession) {
        break;
      }

      if (!mainWindow || mainWindow.isDestroyed()) {
        break;
      }

      // Log every SDK event to JSONL for debugging
      logSessionEvent(sdkMessage);

      if (sdkMessage.type === 'stream_event') {
        // Handle streaming events
        const streamEvent = sdkMessage.event;
        if (streamEvent.type === 'content_block_delta') {
          if (streamEvent.delta.type === 'text_delta') {
            // Regular text delta
            mainWindow.webContents.send('chat:message-chunk', streamEvent.delta.text);
          } else if (streamEvent.delta.type === 'thinking_delta') {
            // Thinking text delta - send as thinking chunk
            mainWindow.webContents.send('chat:thinking-chunk', {
              index: streamEvent.index,
              delta: streamEvent.delta.thinking
            });
          } else if (streamEvent.delta.type === 'input_json_delta') {
            // Handle input JSON deltas for tool use
            // Look up the tool ID for this stream index
            const toolId = streamIndexToToolId.get(streamEvent.index);
            mainWindow.webContents.send('chat:tool-input-delta', {
              index: streamEvent.index,
              toolId: toolId || '', // Send tool ID if available
              delta: streamEvent.delta.partial_json
            });
          }
        } else if (streamEvent.type === 'content_block_start') {
          // Handle thinking blocks
          if (streamEvent.content_block.type === 'thinking') {
            mainWindow.webContents.send('chat:thinking-start', {
              index: streamEvent.index
            });
          } else if (streamEvent.content_block.type === 'tool_use') {
            // Store mapping of stream index to tool ID
            streamIndexToToolId.set(streamEvent.index, streamEvent.content_block.id);

            mainWindow.webContents.send('chat:tool-use-start', {
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
            // Handle tool result blocks starting - these are the actual tool result types
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
              mainWindow.webContents.send('chat:tool-result-start', {
                toolUseId: toolResultBlock.tool_use_id,
                content: contentStr,
                isError: toolResultBlock.is_error || false
              });
            }
          }
        } else if (streamEvent.type === 'content_block_stop') {
          // Signal end of a content block
          // Look up tool ID for this stream index (if it's a tool block)
          const toolId = streamIndexToToolId.get(streamEvent.index);
          mainWindow.webContents.send('chat:content-block-stop', {
            index: streamEvent.index,
            toolId: toolId || undefined
          });
        }
      } else if (sdkMessage.type === 'assistant') {
        // Handle complete assistant messages - extract tool results
        const assistantMessage = sdkMessage.message;
        if (assistantMessage.content) {
          for (const block of assistantMessage.content) {
            // Check for tool result blocks (SDK uses specific types like web_search_tool_result, etc.)
            // These blocks have tool_use_id and content properties
            if (
              typeof block === 'object' &&
              block !== null &&
              'tool_use_id' in block &&
              'content' in block
            ) {
              // Type guard for tool_result-like blocks
              // Content contains ToolOutput types (BashOutput, ReadOutput, GrepOutput, etc.)
              // which are structured objects describing the tool's result
              const toolResultBlock = block as {
                tool_use_id: string;
                content: string | unknown[] | unknown;
                is_error?: boolean;
              };

              // Convert content to string representation
              // Content can be:
              // - A string (for simple text results)
              // - An array of content blocks (text, images, etc.) from Anthropic API
              // - A structured ToolOutput object (BashOutput, ReadOutput, GrepOutput, etc.)
              let contentStr: string;
              if (typeof toolResultBlock.content === 'string') {
                contentStr = toolResultBlock.content;
              } else if (Array.isArray(toolResultBlock.content)) {
                // Array of content blocks - extract text from each
                contentStr = toolResultBlock.content
                  .map((c) => {
                    if (typeof c === 'string') {
                      return c;
                    }
                    if (typeof c === 'object' && c !== null) {
                      // Could be text block, image block, etc.
                      if ('text' in c && typeof c.text === 'string') {
                        return c.text;
                      }
                      if ('type' in c && c.type === 'text' && 'text' in c) {
                        return String(c.text);
                      }
                      // For other types, stringify
                      return JSON.stringify(c, null, 2);
                    }
                    return String(c);
                  })
                  .join('\n');
              } else if (
                typeof toolResultBlock.content === 'object' &&
                toolResultBlock.content !== null
              ) {
                // Structured ToolOutput object (e.g., BashOutput with output/exitCode,
                // ReadOutput with content/total_lines, GrepOutput with matches, etc.)
                // Stringify as JSON - the renderer will format it nicely
                contentStr = JSON.stringify(toolResultBlock.content, null, 2);
              } else {
                contentStr = String(toolResultBlock.content);
              }

              // Send tool result - this will be displayed in the UI
              mainWindow.webContents.send('chat:tool-result-complete', {
                toolUseId: toolResultBlock.tool_use_id,
                content: contentStr,
                isError: toolResultBlock.is_error || false
              });
            }
          }
        }
        // Don't signal completion here - agent may still be running tools
      } else if (sdkMessage.type === 'result') {
        // Final result message - this is when the agent is truly done
        mainWindow.webContents.send('chat:message-complete');
      } else if (sdkMessage.type === 'system') {
        if (sdkMessage.subtype === 'init') {
          const sessionIdFromSdk = sdkMessage.session_id;
          if (sessionIdFromSdk) {
            setSessionId(sessionIdFromSdk);
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('chat:session-updated', {
                sessionId: sessionIdFromSdk,
                resumed: isResumedSession
              });
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('Error in streaming session:', error);
    if (mainWindow && !mainWindow.isDestroyed()) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      mainWindow.webContents.send('chat:message-error', errorMessage);
    }
  } finally {
    endSessionLog();
    isProcessing = false;
    querySession = null;

    // Resolve the termination promise to signal session has ended
    resolveTermination!();
  }
}
