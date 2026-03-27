/**
 * Claude Code agent implementation using @anthropic-ai/claude-agent-sdk.
 *
 * Uses the `query()` API with `canUseTool` callback to intercept questions
 * and relay them back to the orchestrator.
 */

import { query, type Query, type SDKMessage } from '@anthropic-ai/claude-agent-sdk';

import { buildClaudeSessionEnv } from '../config';
import type { CodingTaskEventHandler } from './types';

/** Resolver for pending question responses. */
interface PendingQuestionResolver {
  resolve: (answer: string) => void;
}

export class ClaudeCodeAgent {
  private activeQuery: Query | null = null;
  private pendingQuestion: PendingQuestionResolver | null = null;
  private abortController: AbortController | null = null;

  async run(
    taskId: string,
    prompt: string,
    cwd: string,
    onEvent: CodingTaskEventHandler
  ): Promise<void> {
    this.abortController = new AbortController();

    this.activeQuery = query({
      prompt,
      options: {
        cwd,
        allowedTools: ['Read', 'Edit', 'Write', 'Bash', 'Glob', 'Grep'],
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        abortController: this.abortController,
        env: buildClaudeSessionEnv(),
        systemPrompt: {
          type: 'preset',
          preset: 'claude_code',
          append:
            '你是被派遣执行编程任务的智能体。高效完成任务，遇到不确定的问题时使用 AskUserQuestion 工具向编排者提问。'
        },
        canUseTool: async (toolName, input) => {
          if (toolName === 'AskUserQuestion') {
            const questionText = extractQuestionText(input);
            onEvent(taskId, { type: 'question', message: questionText });

            // Wait for the orchestrator to provide an answer
            const answer = await new Promise<string>((resolve) => {
              this.pendingQuestion = { resolve };
            });
            this.pendingQuestion = null;

            return {
              behavior: 'allow' as const,
              updatedInput: { ...input, answer }
            };
          }

          return { behavior: 'allow' as const, updatedInput: input };
        }
      }
    });

    try {
      for await (const message of this.activeQuery) {
        this.handleMessage(taskId, message, onEvent);
      }
    } catch (error) {
      if (this.abortController?.signal.aborted) {
        return; // Intentional stop, don't emit error
      }
      const errorMessage = error instanceof Error ? error.message : String(error);
      onEvent(taskId, { type: 'error', message: errorMessage });
    } finally {
      this.activeQuery = null;
      this.abortController = null;
    }
  }

  private handleMessage(
    taskId: string,
    message: SDKMessage,
    onEvent: CodingTaskEventHandler
  ): void {
    switch (message.type) {
      case 'assistant': {
        const text = message.message.content
          .filter((block) => block.type === 'text')
          .map((block) => ('text' in block ? (block as { text: string }).text : ''))
          .join('');
        if (text) {
          onEvent(taskId, { type: 'progress', message: text });
        }
        break;
      }
      case 'result': {
        if (message.subtype === 'success') {
          onEvent(taskId, {
            type: 'completed',
            message: extractResultText(message)
          });
        } else {
          onEvent(taskId, {
            type: 'error',
            message: `Task ended: ${message.subtype}`
          });
        }
        break;
      }
      default:
        break;
    }
  }

  /** Send a response to a pending question. */
  respondToQuestion(answer: string): boolean {
    if (!this.pendingQuestion) {
      return false;
    }
    this.pendingQuestion.resolve(answer);
    return true;
  }

  /** Whether the agent is waiting for a question response. */
  isWaitingForResponse(): boolean {
    return this.pendingQuestion !== null;
  }

  /** Stop the running task. */
  async stop(): Promise<void> {
    // Unblock any pending question first
    if (this.pendingQuestion) {
      this.pendingQuestion.resolve('Task cancelled.');
      this.pendingQuestion = null;
    }
    if (this.activeQuery) {
      await this.activeQuery.interrupt();
    }
    this.abortController?.abort();
  }
}

function extractQuestionText(input: Record<string, unknown>): string {
  if (typeof input.question === 'string') {
    return input.question;
  }
  if (Array.isArray(input.questions)) {
    return input.questions
      .map((q: { question?: string; text?: string }) => q.question ?? q.text ?? String(q))
      .join('\n');
  }
  return JSON.stringify(input);
}

function extractResultText(message: SDKMessage): string {
  if (message.type !== 'result') {
    return 'Task completed.';
  }
  // SDKResultSuccess has a 'result' field with the final text
  const result = message as Record<string, unknown>;
  if (typeof result.result === 'string') {
    return result.result;
  }
  return 'Task completed.';
}
