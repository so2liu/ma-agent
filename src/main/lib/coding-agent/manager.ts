/**
 * CodingAgentManager — manages background coding tasks.
 *
 * Provides a unified interface for starting/stopping tasks, responding to questions,
 * and receiving events from Claude Code and Codex sub-agents.
 *
 * When a task emits a question/completion/error event, the manager invokes its
 * notification callback, which the PiRuntime wires up to inject a system-reminder
 * message into the orchestrator's conversation.
 */

import { randomUUID } from 'crypto';

import { ClaudeCodeAgent } from './claude-code-agent';
import { CodexAgent } from './codex-agent';
import type {
  CodingTask,
  CodingTaskEvent,
  CodingTaskEventHandler,
  CodingTaskInfo,
  StartCodingTaskOptions
} from './types';

/** Maximum output lines kept per task (to avoid unbounded memory growth). */
const MAX_OUTPUT_LINES = 200;

/** Number of recent output lines returned in task info. */
const RECENT_OUTPUT_LINES = 30;

/** A pending notification that couldn't be delivered because the session was inactive. */
interface PendingNotification {
  chatId: string;
  taskId: string;
  event: CodingTaskEvent;
}

export class CodingAgentManager {
  private tasks = new Map<string, CodingTask>();
  private claudeAgents = new Map<string, ClaudeCodeAgent>();
  private codexAgents = new Map<string, CodexAgent>();

  /** Notifications that couldn't be delivered because the target session was inactive. */
  private pendingNotifications: PendingNotification[] = [];

  /**
   * Called when a task event should be relayed to the orchestrator.
   * Signature: (chatId, taskId, event) => Promise<boolean> (true if delivered).
   * Wired by chat-handlers to inject system-reminder messages into PiRuntime.
   */
  onTaskNotification:
    | ((chatId: string, taskId: string, event: CodingTaskEvent) => Promise<boolean>)
    | null = null;

  /**
   * Called on every task event (including progress) to update the renderer UI.
   * Wired by coding-task-handlers to push events to the renderer via IPC.
   */
  onUIUpdate: ((chatId: string, taskId: string, event: CodingTaskEvent) => void) | null = null;

  /** Start a new coding task in the background. */
  startTask(options: StartCodingTaskOptions): string {
    const taskId = randomUUID().slice(0, 8);
    const now = Date.now();

    const task: CodingTask = {
      id: taskId,
      chatId: options.chatId,
      name: options.name,
      engine: options.engine,
      status: 'running',
      cwd: options.cwd,
      prompt: options.prompt,
      output: [],
      pendingQuestion: null,
      result: null,
      error: null,
      createdAt: now,
      updatedAt: now
    };

    this.tasks.set(taskId, task);

    const eventHandler: CodingTaskEventHandler = (id, event) => {
      this.handleTaskEvent(id, event);
    };

    if (options.engine === 'claude-code') {
      const agent = new ClaudeCodeAgent();
      this.claudeAgents.set(taskId, agent);
      void agent.run(taskId, options.prompt, options.cwd, eventHandler).catch((error) => {
        this.handleTaskEvent(taskId, {
          type: 'error',
          message: error instanceof Error ? error.message : String(error)
        });
      });
    } else {
      const agent = new CodexAgent();
      this.codexAgents.set(taskId, agent);
      void agent.run(taskId, options.prompt, options.cwd, eventHandler).catch((error) => {
        this.handleTaskEvent(taskId, {
          type: 'error',
          message: error instanceof Error ? error.message : String(error)
        });
      });
    }

    // Emit initial UI update so the panel shows the task immediately
    this.notifyUI(taskId, { type: 'progress', message: 'Task started.' });

    return taskId;
  }

  /** Respond to a pending question on a task. */
  respondToTask(taskId: string, answer: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) {
      return false;
    }

    if (task.engine === 'claude-code') {
      const agent = this.claudeAgents.get(taskId);
      if (!agent) {
        return false;
      }
      const responded = agent.respondToQuestion(answer);
      if (responded) {
        task.status = 'running';
        task.pendingQuestion = null;
        task.updatedAt = Date.now();
        this.notifyUI(taskId, { type: 'progress', message: 'Response sent, continuing...' });
      }
      return responded;
    }

    // For Codex, "responding" means sending a follow-up turn
    if (task.engine === 'codex') {
      const agent = this.codexAgents.get(taskId);
      if (!agent || agent.isRunning()) {
        return false;
      }
      task.status = 'running';
      task.pendingQuestion = null;
      task.updatedAt = Date.now();
      this.notifyUI(taskId, { type: 'progress', message: 'Follow-up sent, continuing...' });

      const eventHandler: CodingTaskEventHandler = (id, event) => {
        this.handleTaskEvent(id, event);
      };
      void agent.sendFollowUp(taskId, answer, eventHandler);
      return true;
    }

    return false;
  }

  /** Stop a running task. */
  async stopTask(taskId: string): Promise<boolean> {
    const task = this.tasks.get(taskId);
    if (!task) {
      return false;
    }

    if (task.engine === 'claude-code') {
      const agent = this.claudeAgents.get(taskId);
      if (agent) {
        await agent.stop();
        this.claudeAgents.delete(taskId);
      }
    } else {
      const agent = this.codexAgents.get(taskId);
      if (agent) {
        await agent.stop();
        this.codexAgents.delete(taskId);
      }
    }

    task.status = 'stopped';
    task.updatedAt = Date.now();
    this.notifyUI(taskId, { type: 'error', message: 'Task stopped.' });
    return true;
  }

  /** Stop all tasks belonging to a specific chat session. */
  async stopTasksForChat(chatId: string): Promise<void> {
    const taskIds = Array.from(this.tasks.values())
      .filter((t) => t.chatId === chatId && (t.status === 'running' || t.status === 'waiting'))
      .map((t) => t.id);

    for (const taskId of taskIds) {
      await this.stopTask(taskId);
    }

    // Also remove pending notifications for this chat
    this.pendingNotifications = this.pendingNotifications.filter((n) => n.chatId !== chatId);
  }

  /** Drain pending notifications for a chat that just became active. */
  async drainPendingNotifications(chatId: string): Promise<void> {
    const toDeliver = this.pendingNotifications.filter((n) => n.chatId === chatId);
    this.pendingNotifications = this.pendingNotifications.filter((n) => n.chatId !== chatId);

    for (const notification of toDeliver) {
      await this.notifyOrchestrator(notification.taskId, notification.event);
    }
  }

  /** Get task info, scoped to a specific chat. */
  getTaskForChat(chatId: string, taskId: string): CodingTaskInfo | null {
    const task = this.tasks.get(taskId);
    if (!task || task.chatId !== chatId) {
      return null;
    }
    return toTaskInfo(task);
  }

  /** List tasks for a specific chat. */
  listTasksForChat(chatId: string): CodingTaskInfo[] {
    return Array.from(this.tasks.values())
      .filter((t) => t.chatId === chatId)
      .map(toTaskInfo);
  }

  /** Get task info (global, used by notification formatting). */
  getTask(taskId: string): CodingTaskInfo | null {
    const task = this.tasks.get(taskId);
    if (!task) {
      return null;
    }
    return toTaskInfo(task);
  }

  /** List all tasks. */
  listTasks(): CodingTaskInfo[] {
    return Array.from(this.tasks.values()).map(toTaskInfo);
  }

  /** Handle events from sub-agents. */
  private handleTaskEvent(taskId: string, event: CodingTaskEvent): void {
    const task = this.tasks.get(taskId);
    if (!task) {
      return;
    }

    task.updatedAt = Date.now();

    switch (event.type) {
      case 'progress':
        task.output.push(event.message);
        if (task.output.length > MAX_OUTPUT_LINES) {
          task.output = task.output.slice(-MAX_OUTPUT_LINES);
        }
        this.notifyUI(taskId, event);
        break;

      case 'question':
        task.status = 'waiting';
        task.pendingQuestion = event.message;
        this.notifyUI(taskId, event);
        void this.notifyOrchestrator(taskId, event);
        break;

      case 'completed':
        if (task.status === 'failed') {
          break;
        }
        task.status = 'completed';
        task.result = event.message;
        this.notifyUI(taskId, event);
        void this.notifyOrchestrator(taskId, event);
        break;

      case 'error':
        if (task.status === 'failed') {
          break;
        }
        task.status = 'failed';
        task.error = event.message;
        this.notifyUI(taskId, event);
        void this.notifyOrchestrator(taskId, event);
        break;
    }
  }

  /** Send UI update to the renderer. */
  private notifyUI(taskId: string, event: CodingTaskEvent): void {
    const task = this.tasks.get(taskId);
    if (!task) {
      return;
    }
    this.onUIUpdate?.(task.chatId, taskId, event);
  }

  /** Send notification to the orchestrator (Pi Agent). */
  private async notifyOrchestrator(taskId: string, event: CodingTaskEvent): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) {
      return;
    }

    const delivered = (await this.onTaskNotification?.(task.chatId, taskId, event)) ?? false;
    if (!delivered) {
      // Queue for later delivery when the session becomes active
      this.pendingNotifications.push({ chatId: task.chatId, taskId, event });
    }
  }
}

function toTaskInfo(task: CodingTask): CodingTaskInfo {
  return {
    id: task.id,
    name: task.name,
    engine: task.engine,
    status: task.status,
    pendingQuestion: task.pendingQuestion,
    result: task.result,
    error: task.error,
    recentOutput: task.output.slice(-RECENT_OUTPUT_LINES),
    createdAt: task.createdAt,
    updatedAt: task.updatedAt
  };
}

/** Singleton instance. */
export const codingAgentManager = new CodingAgentManager();
