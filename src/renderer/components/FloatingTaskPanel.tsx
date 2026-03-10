import { CheckCircle2, ChevronDown, ChevronRight, ChevronUp, Circle, ListTodo } from 'lucide-react';
import { useMemo, useState } from 'react';

import type { ContentBlock, Message, TodoWriteInput } from '@/types/chat';

interface TodoItem {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
}

function extractLatestTodos(messages: Message[]): TodoItem[] | null {
  // Walk messages in reverse to find the latest TodoWrite tool use
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== 'assistant' || typeof msg.content === 'string') continue;

    const blocks = msg.content as ContentBlock[];
    for (let j = blocks.length - 1; j >= 0; j--) {
      const block = blocks[j];
      if (block.type === 'tool_use' && block.tool?.name === 'TodoWrite') {
        const input = block.tool.parsedInput as TodoWriteInput | undefined;
        if (input?.todos) {
          // Return null for empty todos so the panel hides when tasks are cleared
          if (input.todos.length === 0) return null;
          return input.todos.map((t) => ({
            content: t.content,
            status: t.status as TodoItem['status']
          }));
        }
      }
    }
  }
  return null;
}

interface FloatingTaskPanelProps {
  messages: Message[];
}

export default function FloatingTaskPanel({ messages }: FloatingTaskPanelProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const todos = useMemo(() => extractLatestTodos(messages), [messages]);

  if (!todos || todos.length === 0) return null;

  const completedCount = todos.filter((t) => t.status === 'completed').length;
  const totalCount = todos.length;
  const progressPercent = Math.round((completedCount / totalCount) * 100);

  return (
    <div className="mx-auto w-full max-w-2xl px-2">
      <div className="dark:bg-neutral-850/90 rounded-2xl border border-neutral-200/60 bg-white/95 shadow-lg shadow-black/5 backdrop-blur-xl dark:border-neutral-700/50 dark:shadow-black/30">
        {/* Header */}
        <button
          type="button"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="flex w-full items-center justify-between px-4 py-2.5"
        >
          <div className="flex items-center gap-2">
            <ListTodo className="size-4 text-neutral-500 dark:text-neutral-400" />
            <span className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
              任务进度
            </span>
            <span className="text-xs text-neutral-400 dark:text-neutral-500">
              {completedCount}/{totalCount}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {/* Progress bar */}
            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
              <div
                className="h-full rounded-full bg-green-500 transition-all duration-300 dark:bg-green-400"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            {isCollapsed ?
              <ChevronDown className="size-3.5 text-neutral-400 dark:text-neutral-500" />
            : <ChevronUp className="size-3.5 text-neutral-400 dark:text-neutral-500" />}
          </div>
        </button>

        {/* Task list */}
        {!isCollapsed && (
          <div className="border-t border-neutral-100 px-4 pt-1.5 pb-3 dark:border-neutral-800">
            <div className="space-y-1">
              {todos.map((todo, index) => (
                <div key={index} className="flex items-start gap-2 py-0.5">
                  <span className="mt-0.5 flex-shrink-0">
                    {todo.status === 'completed' ?
                      <CheckCircle2 className="size-3.5 text-green-500 dark:text-green-400" />
                    : todo.status === 'in_progress' ?
                      <ChevronRight className="size-3.5 text-blue-500 dark:text-blue-400" />
                    : <Circle className="size-3.5 text-neutral-300 dark:text-neutral-600" />}
                  </span>
                  <span
                    className={`text-sm leading-snug ${
                      todo.status === 'completed' ?
                        'text-neutral-400 line-through dark:text-neutral-500'
                      : todo.status === 'in_progress' ? 'text-neutral-700 dark:text-neutral-200'
                      : 'text-neutral-500 dark:text-neutral-400'
                    }`}
                  >
                    {todo.content}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
