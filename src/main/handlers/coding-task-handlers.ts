/**
 * IPC handlers for coding task UI events.
 *
 * Wires CodingAgentManager's UI events to the renderer via IPC,
 * allowing the CodingTaskPanel component to show real-time progress.
 */

import type { BrowserWindow } from 'electron';

import { codingAgentManager } from '../lib/coding-agent';
import type { CodingTaskUpdateEvent } from '../../shared/types/coding-task';

export function registerCodingTaskHandlers(getMainWindow: () => BrowserWindow | null): void {
  codingAgentManager.onUIUpdate = (chatId, taskId, event) => {
    const mainWindow = getMainWindow();
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }

    const task = codingAgentManager.getTask(taskId);
    if (!task) {
      return;
    }

    const update: CodingTaskUpdateEvent = {
      chatId,
      taskId,
      name: task.name,
      engine: task.engine,
      status: task.status
    };

    switch (event.type) {
      case 'progress':
        update.outputLine = event.message;
        break;
      case 'question':
        update.pendingQuestion = event.message;
        break;
      case 'completed':
        update.result = event.message;
        break;
      case 'error':
        update.error = event.message;
        break;
    }

    mainWindow.webContents.send('coding-task:update', update);
  };
}
