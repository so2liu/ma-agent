import { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Code2,
  Loader2,
  CheckCircle2,
  XCircle,
  HelpCircle
} from 'lucide-react';

import type { CodingTaskState } from '../../shared/types/coding-task';

interface CodingTaskPanelProps {
  codingTasks: Map<string, CodingTaskState>;
}

const MAX_VISIBLE_LINES = 20;

function StatusIcon({ status }: { status: CodingTaskState['status'] }) {
  switch (status) {
    case 'running':
      return <Loader2 className="size-3.5 animate-spin text-blue-500 dark:text-blue-400" />;
    case 'waiting':
      return <HelpCircle className="size-3.5 text-amber-500 dark:text-amber-400" />;
    case 'completed':
      return <CheckCircle2 className="size-3.5 text-green-500 dark:text-green-400" />;
    case 'failed':
    case 'stopped':
      return <XCircle className="size-3.5 text-red-500 dark:text-red-400" />;
  }
}

function statusLabel(status: CodingTaskState['status']): string {
  switch (status) {
    case 'running':
      return '工作中';
    case 'waiting':
      return '等待决策';
    case 'completed':
      return '已完成';
    case 'failed':
      return '出错';
    case 'stopped':
      return '已停止';
  }
}

function engineLabel(engine: CodingTaskState['engine']): string {
  return engine === 'claude-code' ? 'Claude Code' : 'Codex';
}

function TaskDetail({ task }: { task: CodingTaskState }) {
  const [expanded, setExpanded] = useState(false);
  const visibleLines = task.outputLines.slice(-MAX_VISIBLE_LINES);

  return (
    <div className="border-t border-neutral-100 dark:border-neutral-700">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-4 py-2 text-left hover:bg-neutral-50 dark:hover:bg-neutral-700/50"
      >
        <span className="flex-shrink-0">
          <StatusIcon status={task.status} />
        </span>
        <span className="min-w-0 flex-1 truncate text-sm text-neutral-700 dark:text-neutral-200">
          {task.name}
        </span>
        <span className="flex-shrink-0 text-[10px] text-neutral-400">
          {engineLabel(task.engine)}
        </span>
        <span className="flex-shrink-0">
          {expanded ?
            <ChevronDown className="size-3 text-neutral-400" />
          : <ChevronRight className="size-3 text-neutral-400" />}
        </span>
      </button>

      {expanded && (
        <div className="px-4 pb-3">
          {task.pendingQuestion && (
            <div className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
              <span className="font-medium">等待决策：</span> {task.pendingQuestion}
            </div>
          )}

          {task.error && (
            <div className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-900/30 dark:text-red-300">
              {task.error}
            </div>
          )}

          {task.result && task.status === 'completed' && (
            <div className="mb-2 rounded-lg bg-green-50 px-3 py-2 text-xs text-green-700 dark:bg-green-900/30 dark:text-green-300">
              {task.result.length > 200 ? task.result.slice(0, 200) + '…' : task.result}
            </div>
          )}

          {visibleLines.length > 0 && (
            <div className="max-h-40 overflow-y-auto rounded-lg bg-neutral-50 p-2 font-mono text-[11px] leading-relaxed text-neutral-600 dark:bg-neutral-900/50 dark:text-neutral-400">
              {visibleLines.map((line, i) => (
                <div key={i} className="whitespace-pre-wrap break-all">
                  {line.length > 300 ? line.slice(0, 300) + '…' : line}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function CodingTaskPanel({ codingTasks }: CodingTaskPanelProps) {
  const tasks = Array.from(codingTasks.values());
  if (tasks.length === 0) return null;

  const activeTasks = tasks.filter((t) => t.status === 'running' || t.status === 'waiting');
  const hasActive = activeTasks.length > 0;

  return (
    <div className="mx-auto w-full max-w-2xl px-2">
      <div className="overflow-hidden rounded-2xl border border-neutral-200/60 bg-white/95 shadow-lg shadow-black/5 backdrop-blur-xl dark:border-neutral-600/50 dark:bg-neutral-800/95 dark:shadow-black/30">
        <div className="flex items-center gap-2 px-4 py-2">
          <Code2 className="size-4 text-neutral-500 dark:text-neutral-400" />
          <span className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
            编程任务
          </span>
          {hasActive && (
            <span className="flex items-center gap-1 text-xs text-blue-500 dark:text-blue-400">
              <Loader2 className="size-3 animate-spin" />
              {activeTasks.length} 个{statusLabel(activeTasks[0].status)}
            </span>
          )}
        </div>

        {tasks.map((task) => (
          <TaskDetail key={task.taskId} task={task} />
        ))}
      </div>
    </div>
  );
}
