import { Notification } from 'electron';

import { isSessionActive } from './claude-session';
import { listScheduledTasks, updateScheduledTask } from './schedule-db';
import { executeScheduledTask } from './schedule-executor';
import { isScheduledTaskExecuting, setScheduledTaskExecuting } from './schedule-state';

let intervalId: ReturnType<typeof setInterval> | null = null;

function matchesField(spec: string, value: number): boolean {
  if (spec === '*') return true;

  if (spec.startsWith('*/')) {
    const step = parseInt(spec.slice(2));
    return !isNaN(step) && step > 0 && value % step === 0;
  }

  for (const part of spec.split(',')) {
    if (part.includes('-')) {
      const [start, end] = part.split('-').map(Number);
      if (!isNaN(start) && !isNaN(end) && value >= start && value <= end) return true;
    } else {
      if (parseInt(part) === value) return true;
    }
  }

  return false;
}

function matchesCron(expression: string, date: Date): boolean {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) return false;

  const [minuteSpec, hourSpec, daySpec, monthSpec, dowSpec] = parts;
  return (
    matchesField(minuteSpec, date.getMinutes()) &&
    matchesField(hourSpec, date.getHours()) &&
    matchesField(daySpec, date.getDate()) &&
    matchesField(monthSpec, date.getMonth() + 1) &&
    matchesField(dowSpec, date.getDay())
  );
}

async function checkAndExecute(): Promise<void> {
  if (isScheduledTaskExecuting()) return;

  const now = new Date();
  const tasks = listScheduledTasks().filter((t) => t.enabled);

  for (const task of tasks) {
    if (!matchesCron(task.cronExpression, now)) continue;

    // Prevent running the same task multiple times in the same minute
    if (task.lastRunAt && now.getTime() - task.lastRunAt < 60_000) continue;

    if (isSessionActive()) {
      updateScheduledTask(task.id, {
        lastRunAt: now.getTime(),
        lastRunStatus: 'skipped'
      });
      new Notification({
        title: '定时任务已跳过',
        body: `"${task.name}" 因当前有活跃会话而跳过`
      }).show();
      continue;
    }

    setScheduledTaskExecuting(true);
    try {
      const conversationId = await executeScheduledTask(task);
      updateScheduledTask(task.id, {
        lastRunAt: now.getTime(),
        lastRunStatus: 'success',
        lastRunConversationId: conversationId
      });
      new Notification({
        title: '定时任务完成',
        body: `"${task.name}" 执行成功`
      }).show();
    } catch (error) {
      console.error(`Scheduled task "${task.name}" failed:`, error);
      updateScheduledTask(task.id, {
        lastRunAt: now.getTime(),
        lastRunStatus: 'error'
      });
      new Notification({
        title: '定时任务失败',
        body: `"${task.name}" 执行出错: ${error instanceof Error ? error.message : 'Unknown error'}`
      }).show();
    } finally {
      setScheduledTaskExecuting(false);
    }
  }
}

export function startScheduler(): void {
  if (intervalId) return;
  intervalId = setInterval(() => {
    checkAndExecute().catch((error) => {
      console.error('Scheduler tick error:', error);
    });
  }, 60_000);

  // Also check on start
  checkAndExecute().catch((error) => {
    console.error('Scheduler initial check error:', error);
  });
}

export function stopScheduler(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
