/**
 * Codex agent implementation using @openai/codex-sdk.
 *
 * Uses the turn-based model: send prompt → agent runs autonomously → collect results.
 * Multi-turn conversation is supported by calling run/runStreamed repeatedly on the same thread.
 */

import { Codex } from '@openai/codex-sdk';

import { getOpenAIApiKey } from '../config';
import type { CodingTaskEventHandler } from './types';

export class CodexAgent {
  private codex: Codex | null = null;
  private thread: ReturnType<Codex['startThread']> | null = null;
  private running = false;
  private abortController: AbortController | null = null;

  async run(
    taskId: string,
    prompt: string,
    cwd: string,
    onEvent: CodingTaskEventHandler
  ): Promise<void> {
    const apiKey = getOpenAIApiKey();
    if (!apiKey) {
      onEvent(taskId, { type: 'error', message: 'OpenAI API key is not configured.' });
      return;
    }

    this.codex = new Codex({ apiKey });
    this.thread = this.codex.startThread({
      workingDirectory: cwd,
      sandboxMode: 'workspace-write',
      approvalPolicy: 'never',
      skipGitRepoCheck: true
    });

    await this.executeTurn(taskId, prompt, onEvent);
  }

  /** Send a follow-up message to continue the conversation. */
  async sendFollowUp(
    taskId: string,
    message: string,
    onEvent: CodingTaskEventHandler
  ): Promise<void> {
    if (!this.thread) {
      onEvent(taskId, { type: 'error', message: 'No active thread.' });
      return;
    }

    await this.executeTurn(taskId, message, onEvent);
  }

  /** Shared turn execution — handles both initial run and follow-ups. */
  private async executeTurn(
    taskId: string,
    input: string,
    onEvent: CodingTaskEventHandler
  ): Promise<void> {
    if (!this.thread) {
      onEvent(taskId, { type: 'error', message: 'No active thread.' });
      return;
    }

    this.running = true;
    this.abortController = new AbortController();
    let hadError = false;

    try {
      const { events } = await this.thread.runStreamed(input, {
        signal: this.abortController.signal
      });

      for await (const event of events) {
        switch (event.type) {
          case 'item.completed': {
            const item = event.item;
            if (item.type === 'agent_message' && item.text) {
              onEvent(taskId, { type: 'progress', message: item.text });
            } else if (item.type === 'command_execution') {
              const summary = `$ ${item.command}\n[exit ${item.exit_code}]`;
              onEvent(taskId, { type: 'progress', message: summary });
            } else if (item.type === 'file_change' && item.changes) {
              const fileList = item.changes
                .map((c: { kind: string; path: string }) => `${c.kind}: ${c.path}`)
                .join(', ');
              onEvent(taskId, { type: 'progress', message: `Files: ${fileList}` });
            }
            break;
          }
          case 'turn.failed':
            hadError = true;
            onEvent(taskId, {
              type: 'error',
              message: event.error?.message ?? 'Turn failed'
            });
            break;
          default:
            break;
        }
      }

      // Only emit completed if the turn didn't fail
      if (!hadError) {
        onEvent(taskId, {
          type: 'completed',
          message: 'Turn completed.'
        });
      }
    } catch (error) {
      if (this.abortController?.signal.aborted) {
        return;
      }
      const errorMessage = error instanceof Error ? error.message : String(error);
      onEvent(taskId, { type: 'error', message: errorMessage });
    } finally {
      this.running = false;
      this.abortController = null;
    }
  }

  /** Stop the running task. */
  async stop(): Promise<void> {
    this.abortController?.abort();
    this.running = false;
  }

  isRunning(): boolean {
    return this.running;
  }
}
