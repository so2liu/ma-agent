import {
  ArrowLeft,
  Clock,
  Pause,
  Play,
  Plus,
  RotateCw,
  Trash2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import type { ScheduledTask } from '@/electron';
import type { ChatModelPreference } from '../../shared/types/ipc';

interface SchedulesProps {
  onBack: () => void;
}

const CRON_PRESETS = [
  { label: '每 15 分钟', value: '*/15 * * * *' },
  { label: '每 30 分钟', value: '*/30 * * * *' },
  { label: '每小时整点', value: '0 * * * *' },
  { label: '每天 09:00', value: '0 9 * * *' },
  { label: '每天 18:00', value: '0 18 * * *' },
  { label: '工作日 09:00', value: '0 9 * * 1-5' },
  { label: '每周一 09:00', value: '0 9 * * 1' },
  { label: '每天 00:00', value: '0 0 * * *' },
];

const CRON_DESCRIPTIONS: Record<string, string> = Object.fromEntries(
  CRON_PRESETS.map((p) => [p.value, p.label])
);

function describeCron(expr: string): string {
  return CRON_DESCRIPTIONS[expr.trim()] ?? expr;
}

const MODEL_LABELS: Record<ChatModelPreference, string> = {
  fast: 'Haiku (Fast)',
  'smart-sonnet': 'Sonnet (Smart)',
  'smart-opus': 'Opus (Smart)',
};

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  success: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-400', label: '成功' },
  error: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400', label: '失败' },
  skipped: { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-700 dark:text-yellow-400', label: '已跳过' },
};

export default function Schedules({ onBack }: SchedulesProps) {
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingTask, setEditingTask] = useState<ScheduledTask | null>(null);
  const [runningTaskId, setRunningTaskId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formPrompt, setFormPrompt] = useState('');
  const [formCron, setFormCron] = useState('0 9 * * *');
  const [formModel, setFormModel] = useState<ChatModelPreference>('fast');

  const loadTasks = useCallback(async () => {
    try {
      const response = await window.electron.schedule.list();
      if (response.success && response.tasks) {
        setTasks(response.tasks);
      }
    } catch (error) {
      console.error('Error loading scheduled tasks:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  // Auto-dismiss error after 5s
  useEffect(() => {
    if (!errorMessage) return;
    const timer = setTimeout(() => setErrorMessage(null), 5000);
    return () => clearTimeout(timer);
  }, [errorMessage]);

  const resetForm = () => {
    setFormName('');
    setFormPrompt('');
    setFormCron('0 9 * * *');
    setFormModel('fast');
    setEditingTask(null);
  };

  const openCreateForm = () => {
    resetForm();
    setShowForm(true);
  };

  const openEditForm = (task: ScheduledTask) => {
    setFormName(task.name);
    setFormPrompt(task.prompt);
    setFormCron(task.cronExpression);
    setFormModel(task.modelPreference);
    setEditingTask(task);
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!formName.trim() || !formPrompt.trim() || !formCron) return;

    try {
      const response = editingTask
        ? await window.electron.schedule.update(editingTask.id, {
            name: formName.trim(),
            prompt: formPrompt.trim(),
            cronExpression: formCron,
            modelPreference: formModel,
          })
        : await window.electron.schedule.create({
            name: formName.trim(),
            prompt: formPrompt.trim(),
            cronExpression: formCron,
            modelPreference: formModel,
          });

      if (!response.success) {
        setErrorMessage(response.error ?? '操作失败');
        return;
      }
      setShowForm(false);
      resetForm();
      await loadTasks();
    } catch (error) {
      console.error('Error saving scheduled task:', error);
      setErrorMessage('保存失败');
    }
  };

  const handleToggle = async (task: ScheduledTask) => {
    try {
      const response = await window.electron.schedule.update(task.id, { enabled: !task.enabled });
      if (!response.success) {
        setErrorMessage(response.error ?? '操作失败');
        return;
      }
      await loadTasks();
    } catch (error) {
      console.error('Error toggling task:', error);
    }
  };

  const handleDelete = async (taskId: string) => {
    try {
      const response = await window.electron.schedule.delete(taskId);
      if (!response.success) {
        setErrorMessage(response.error ?? '删除失败');
        return;
      }
      await loadTasks();
    } catch (error) {
      console.error('Error deleting task:', error);
    }
  };

  const handleRunNow = async (taskId: string) => {
    setRunningTaskId(taskId);
    try {
      const response = await window.electron.schedule.runNow(taskId);
      if (!response.success) {
        setErrorMessage(response.error ?? '执行失败');
      }
      await loadTasks();
    } catch (error) {
      console.error('Error running task:', error);
      setErrorMessage('执行失败');
    } finally {
      setRunningTaskId(null);
    }
  };

  const formatTime = (timestamp?: number) => {
    if (!timestamp) return '--';
    return new Date(timestamp).toLocaleString();
  };

  return (
    <div className="flex h-screen flex-col bg-white dark:bg-neutral-900">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
        <div className="h-7 [-webkit-app-region:drag]" />
        <button
          onClick={onBack}
          className="rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
          定时任务
        </h1>
        <div className="flex-1" />
        <button
          onClick={openCreateForm}
          className="flex items-center gap-1.5 rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
        >
          <Plus className="h-3.5 w-3.5" />
          新建任务
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Error toast */}
        {errorMessage && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
            {errorMessage}
          </div>
        )}

        {/* Info banner */}
        <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-800 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
          定时任务在 App 运行期间按计划自动执行。如果当前有活跃会话，任务会被跳过。
        </div>

        {isLoading ? (
          <div className="py-8 text-center text-sm text-neutral-400">加载中...</div>
        ) : tasks.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <Clock className="h-8 w-8 text-neutral-300 dark:text-neutral-600" />
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              暂无定时任务
            </p>
            <p className="text-xs text-neutral-400 dark:text-neutral-500">
              创建定时任务，让 Agent 按计划自动执行
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {tasks.map((task) => (
              <div
                key={task.id}
                className={`rounded-lg border p-4 transition ${
                  task.enabled
                    ? 'border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800'
                    : 'border-neutral-100 bg-neutral-50 opacity-60 dark:border-neutral-800 dark:bg-neutral-900'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3
                        className="cursor-pointer truncate text-sm font-medium text-neutral-800 hover:text-blue-600 dark:text-neutral-200 dark:hover:text-blue-400"
                        onClick={() => openEditForm(task)}
                      >
                        {task.name}
                      </h3>
                      {task.lastRunStatus && (
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLES[task.lastRunStatus]?.bg} ${STATUS_STYLES[task.lastRunStatus]?.text}`}
                        >
                          {STATUS_STYLES[task.lastRunStatus]?.label}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-neutral-500 dark:text-neutral-400">
                      {task.prompt}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-neutral-400 dark:text-neutral-500">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {describeCron(task.cronExpression)}
                      </span>
                      <span>{MODEL_LABELS[task.modelPreference]}</span>
                      {task.lastRunAt && (
                        <span>上次运行: {formatTime(task.lastRunAt)}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => handleRunNow(task.id)}
                      disabled={runningTaskId === task.id}
                      className="rounded p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 disabled:opacity-50 dark:text-neutral-500 dark:hover:bg-neutral-700 dark:hover:text-neutral-300"
                      title="立即运行"
                    >
                      <RotateCw
                        className={`h-3.5 w-3.5 ${runningTaskId === task.id ? 'animate-spin' : ''}`}
                      />
                    </button>
                    <button
                      onClick={() => handleToggle(task)}
                      className="rounded p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:text-neutral-500 dark:hover:bg-neutral-700 dark:hover:text-neutral-300"
                      title={task.enabled ? '暂停' : '启用'}
                    >
                      {task.enabled ? (
                        <Pause className="h-3.5 w-3.5" />
                      ) : (
                        <Play className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <button
                      onClick={() => handleDelete(task.id)}
                      className="rounded p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-red-500 dark:text-neutral-500 dark:hover:bg-neutral-700 dark:hover:text-red-400"
                      title="删除"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="mx-4 w-full max-w-lg rounded-xl border border-neutral-200 bg-white shadow-xl dark:border-neutral-700 dark:bg-neutral-800">
            {/* Modal header */}
            <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-3 dark:border-neutral-700">
              <h2 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
                {editingTask ? '编辑定时任务' : '新建定时任务'}
              </h2>
              <button
                onClick={() => {
                  setShowForm(false);
                  resetForm();
                }}
                className="rounded p-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal body */}
            <div className="space-y-4 p-5">
              {/* Name */}
              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">
                  任务名称
                </label>
                <input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="例如: 每日代码审查"
                  className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800 placeholder-neutral-400 outline-none focus:border-blue-500 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-200 dark:placeholder-neutral-500"
                />
              </div>

              {/* Prompt */}
              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">
                  Prompt
                </label>
                <textarea
                  value={formPrompt}
                  onChange={(e) => setFormPrompt(e.target.value)}
                  placeholder="要发送给 Agent 的指令..."
                  rows={4}
                  className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800 placeholder-neutral-400 outline-none focus:border-blue-500 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-200 dark:placeholder-neutral-500"
                />
              </div>

              {/* Schedule - presets only */}
              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">
                  执行计划
                </label>
                <select
                  value={formCron}
                  onChange={(e) => setFormCron(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800 outline-none focus:border-blue-500 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-200"
                >
                  {CRON_PRESETS.map((preset) => (
                    <option key={preset.value} value={preset.value}>
                      {preset.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Model */}
              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">
                  模型
                </label>
                <select
                  value={formModel}
                  onChange={(e) => setFormModel(e.target.value as ChatModelPreference)}
                  className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800 outline-none focus:border-blue-500 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-200"
                >
                  <option value="fast">Haiku (Fast)</option>
                  <option value="smart-sonnet">Sonnet (Smart)</option>
                  <option value="smart-opus">Opus (Smart)</option>
                </select>
              </div>
            </div>

            {/* Modal footer */}
            <div className="flex justify-end gap-2 border-t border-neutral-200 px-5 py-3 dark:border-neutral-700">
              <button
                onClick={() => {
                  setShowForm(false);
                  resetForm();
                }}
                className="rounded-lg px-4 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-700"
              >
                取消
              </button>
              <button
                onClick={handleSubmit}
                disabled={!formName.trim() || !formPrompt.trim()}
                className="rounded-lg bg-neutral-900 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-neutral-700 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
              >
                {editingTask ? '保存' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
