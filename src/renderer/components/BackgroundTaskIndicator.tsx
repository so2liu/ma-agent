import { Activity, CheckCircle2, Loader2, XCircle } from 'lucide-react';

import type { BackgroundTask } from '../../shared/types/background-task';

interface BackgroundTaskIndicatorProps {
  backgroundTasks: Map<string, BackgroundTask>;
}

function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m${remainingSeconds}s`;
}

function StatusIcon({ status }: { status: BackgroundTask['status'] }) {
  switch (status) {
    case 'running':
      return <Loader2 className="size-3.5 animate-spin text-blue-500 dark:text-blue-400" />;
    case 'completed':
      return <CheckCircle2 className="size-3.5 text-green-500 dark:text-green-400" />;
    case 'failed':
    case 'stopped':
      return <XCircle className="size-3.5 text-red-500 dark:text-red-400" />;
  }
}

export default function BackgroundTaskIndicator({
  backgroundTasks
}: BackgroundTaskIndicatorProps) {
  const tasks = Array.from(backgroundTasks.values());

  if (tasks.length === 0) return null;

  const activeTasks = tasks.filter((t) => t.status === 'running');

  return (
    <div className="mx-auto w-full max-w-2xl px-2">
      <div className="rounded-2xl border border-neutral-200/60 bg-white/95 shadow-lg shadow-black/5 backdrop-blur-xl dark:border-neutral-600/50 dark:bg-neutral-800/95 dark:shadow-black/30">
        <div className="flex items-center gap-2 px-4 py-2">
          <Activity className="size-4 text-neutral-500 dark:text-neutral-400" />
          <span className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
            后台任务
          </span>
          {activeTasks.length > 0 && (
            <span className="text-xs text-neutral-400">{activeTasks.length} 个运行中</span>
          )}
        </div>
        <div className="border-t border-neutral-100 px-4 pt-1.5 pb-3 dark:border-neutral-700">
          <div className="space-y-1.5">
            {tasks.map((task) => (
              <div key={task.taskId} className="flex items-start gap-2 py-0.5">
                <span className="mt-0.5 flex-shrink-0">
                  <StatusIcon status={task.status} />
                </span>
                <div className="min-w-0 flex-1">
                  <span className="text-sm leading-snug text-neutral-700 dark:text-neutral-200">
                    {task.description || '后台任务'}
                  </span>
                  <div className="flex flex-wrap items-center gap-2 text-[10px] text-neutral-400">
                    {task.lastToolName && (
                      <span className="rounded border border-neutral-200/50 bg-neutral-50/50 px-1 py-0.5 dark:border-neutral-600/50 dark:bg-neutral-900/50">
                        {task.lastToolName}
                      </span>
                    )}
                    <span>{formatDuration(task.durationMs)}</span>
                    <span>{task.toolUses} 次工具调用</span>
                    {task.summary && (
                      <span className="text-neutral-500 dark:text-neutral-300">
                        {task.summary}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
