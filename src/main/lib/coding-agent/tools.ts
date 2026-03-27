/**
 * Custom tools for the Pi Agent to control coding sub-agents.
 *
 * These are registered as `customTools` in `createAgentSession()`, making them
 * available to the Pi Agent alongside the built-in Read/Edit/Bash tools.
 */

import { Type, type Static } from '@sinclair/typebox';
import type { ToolDefinition } from '@mariozechner/pi-coding-agent';

import { codingAgentManager } from './manager';
import type { CodingEngine } from './types';

function text(t: string) {
  return { content: [{ type: 'text' as const, text: t }], details: {} };
}

const StartCodingTaskParams = Type.Object({
  name: Type.String({ description: 'Short human-readable name for the task' }),
  engine: Type.Union([Type.Literal('claude-code'), Type.Literal('codex')], {
    description: 'Which engine to use: claude-code or codex'
  }),
  prompt: Type.String({
    description: 'Detailed instructions for the coding agent. Must be self-contained.'
  }),
  cwd: Type.String({
    description: 'Working directory for the coding task (absolute path)'
  })
});

const TaskIdParams = Type.Object({
  task_id: Type.String({ description: 'The task ID' })
});

const RespondToTaskParams = Type.Object({
  task_id: Type.String({ description: 'The task ID to respond to' }),
  response: Type.String({
    description: 'The response/decision/follow-up instruction to send'
  })
});

const EmptyParams = Type.Object({});

type StartCodingTaskInput = Static<typeof StartCodingTaskParams>;
type TaskIdInput = Static<typeof TaskIdParams>;
type RespondToTaskInput = Static<typeof RespondToTaskParams>;

/**
 * Create coding agent tools bound to a specific chat session.
 * @param chatId The chat session these tools belong to — used to route notifications.
 */
export function createCodingAgentTools(chatId: string): ToolDefinition[] {
  const startTask: ToolDefinition<typeof StartCodingTaskParams> = {
    name: 'start_coding_task',
    label: 'Start Coding Task',
    description:
      'Start a background coding task using Claude Code or Codex. The task runs autonomously. Use check_task or wait for system notifications to track progress.',
    promptSnippet:
      'Start a background coding task (Claude Code or Codex) that runs autonomously.',
    promptGuidelines: [
      'Use this tool to delegate coding work to a sub-agent. Choose claude-code for tasks that may need mid-execution decisions, or codex for autonomous fire-and-forget tasks.',
      'Always provide a detailed, self-contained prompt. The sub-agent has no context from the current conversation.',
      'CRITICAL: After starting a task, do NOT use sleep or polling to check status. You will AUTOMATICALLY receive a <system-reminder> notification when the task completes, fails, or has a question. Simply tell the user the task has started and wait — do NOT call check_task in a loop.',
      'Only use check_task when the user explicitly asks about task status, or when you receive a system-reminder and need more details.'
    ],
    parameters: StartCodingTaskParams,
    execute: async (_toolCallId, params: StartCodingTaskInput) => {
      const taskId = codingAgentManager.startTask({
        chatId,
        name: params.name,
        engine: params.engine as CodingEngine,
        prompt: params.prompt,
        cwd: params.cwd
      });
      return text(
        `Task started successfully.\n- Task ID: ${taskId}\n- Name: ${params.name}\n- Engine: ${params.engine}\n\nIMPORTANT: Do NOT poll or sleep. You will automatically receive a <system-reminder> when this task completes, fails, or needs a decision. Just inform the user and wait.`
      );
    }
  };

  const checkTask: ToolDefinition<typeof TaskIdParams> = {
    name: 'check_task',
    label: 'Check Coding Task',
    description: 'Check the status and recent output of a background coding task.',
    promptSnippet: 'Check status/output of a background coding task.',
    parameters: TaskIdParams,
    execute: async (_toolCallId, params: TaskIdInput) => {
      const info = codingAgentManager.getTaskForChat(chatId, params.task_id);
      if (!info) {
        return text(`Task "${params.task_id}" not found.`);
      }
      return text(JSON.stringify(info, null, 2));
    }
  };

  const respondToTask: ToolDefinition<typeof RespondToTaskParams> = {
    name: 'respond_to_task',
    label: 'Respond to Coding Task',
    description:
      'Send a response to a coding task that is waiting for a decision. For Claude Code tasks, this answers a pending question. For Codex tasks, this sends a follow-up instruction.',
    promptSnippet: 'Respond to a waiting coding task with a decision or follow-up.',
    parameters: RespondToTaskParams,
    execute: async (_toolCallId, params: RespondToTaskInput) => {
      const info = codingAgentManager.getTaskForChat(chatId, params.task_id);
      if (!info) {
        return text(`Task "${params.task_id}" not found.`);
      }
      const success = codingAgentManager.respondToTask(params.task_id, params.response);
      if (!success) {
        return text(
          `Cannot respond to task "${params.task_id}" — current status: ${info.status}.`
        );
      }
      return text(`Response sent to task "${params.task_id}". The task will continue running.`);
    }
  };

  const listTasks: ToolDefinition<typeof EmptyParams> = {
    name: 'list_tasks',
    label: 'List Coding Tasks',
    description: 'List all background coding tasks and their current status.',
    promptSnippet: 'List all background coding tasks.',
    parameters: EmptyParams,
    execute: async () => {
      const tasks = codingAgentManager.listTasksForChat(chatId);
      if (tasks.length === 0) {
        return text('No coding tasks.');
      }

      const summary = tasks
        .map(
          (t) =>
            `- [${t.id}] "${t.name}" (${t.engine}) — ${t.status}${t.pendingQuestion ? ' ⏳ waiting for response' : ''}`
        )
        .join('\n');

      return text(summary);
    }
  };

  const stopTask: ToolDefinition<typeof TaskIdParams> = {
    name: 'stop_task',
    label: 'Stop Coding Task',
    description: 'Stop a running or waiting coding task.',
    promptSnippet: 'Stop a background coding task.',
    parameters: TaskIdParams,
    execute: async (_toolCallId, params: TaskIdInput) => {
      const info = codingAgentManager.getTaskForChat(chatId, params.task_id);
      if (!info) {
        return text(`Task "${params.task_id}" not found.`);
      }
      const success = await codingAgentManager.stopTask(params.task_id);
      if (!success) {
        return text(`Task "${params.task_id}" not found.`);
      }
      return text(`Task "${params.task_id}" has been stopped.`);
    }
  };

  // Cast needed: ToolDefinition<TSchema> uses contravariant renderCall which
  // makes typed definitions not directly assignable to the base type
  return [startTask, checkTask, respondToTask, listTasks, stopTask] as unknown as ToolDefinition[];
}
