import { ipcMain } from 'electron';

import type { ChatModelPreference } from '../../shared/types/ipc';
import {
  createScheduledTask,
  deleteScheduledTask,
  getScheduledTask,
  listScheduledTasks,
  updateScheduledTask
} from '../lib/schedule-db';
import { executeScheduledTask } from '../lib/schedule-executor';
import { isScheduledTaskExecuting, setScheduledTaskExecuting } from '../lib/schedule-state';
import { sessionManager } from '../lib/session-manager';

export function registerScheduleHandlers(): void {
  ipcMain.handle('schedule:list', async () => {
    try {
      const tasks = listScheduledTasks();
      return { success: true, tasks };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  ipcMain.handle(
    'schedule:create',
    async (
      _event,
      data: {
        name: string;
        prompt: string;
        cronExpression: string;
        modelPreference: ChatModelPreference;
      }
    ) => {
      try {
        const task = createScheduledTask(data);
        return { success: true, task };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    }
  );

  ipcMain.handle(
    'schedule:update',
    async (
      _event,
      id: string,
      updates: {
        name?: string;
        prompt?: string;
        cronExpression?: string;
        enabled?: boolean;
        modelPreference?: ChatModelPreference;
      }
    ) => {
      try {
        const task = updateScheduledTask(id, updates);
        return { success: true, task };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    }
  );

  ipcMain.handle('schedule:delete', async (_event, id: string) => {
    try {
      deleteScheduledTask(id);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  ipcMain.handle('schedule:run-now', async (_event, id: string) => {
    try {
      const task = getScheduledTask(id);
      if (!task) return { success: false, error: 'Task not found' };

      if (sessionManager.isAnyChatActive() || isScheduledTaskExecuting()) {
        return { success: false, error: '当前有活跃会话，无法执行定时任务' };
      }

      setScheduledTaskExecuting(true);
      try {
        const conversationId = await executeScheduledTask(task);
        updateScheduledTask(id, {
          lastRunAt: Date.now(),
          lastRunStatus: 'success',
          lastRunConversationId: conversationId
        });
        return { success: true, conversationId };
      } finally {
        setScheduledTaskExecuting(false);
      }
    } catch (error) {
      const task = getScheduledTask(id);
      if (task) {
        updateScheduledTask(id, {
          lastRunAt: Date.now(),
          lastRunStatus: 'error'
        });
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });
}
