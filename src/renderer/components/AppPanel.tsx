import {
  Code,
  Copy,
  Database,
  ExternalLink,
  Hammer,
  Loader2,
  Play,
  Square,
  Wrench
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import type { AppInfo } from '@/electron';

interface AppPanelProps {
  onOpenDbViewer?: (appId: string, appName: string) => void;
  onDebugApp?: (conversationId: string, errorMsg: string) => void;
  apps?: AppInfo[];
  onAppsChanged?: () => void;
}

export default function AppPanel({
  onOpenDbViewer,
  onDebugApp,
  apps: externalApps,
  onAppsChanged
}: AppPanelProps) {
  const [internalApps, setInternalApps] = useState<AppInfo[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [errorAppId, setErrorAppId] = useState<string | null>(null);

  const apps = externalApps ?? internalApps;

  const loadApps = useCallback(async () => {
    if (externalApps) {
      onAppsChanged?.();
      return;
    }
    try {
      const response = await window.electron.app.scan();
      if (response.success) {
        setInternalApps(response.apps);
      }
    } catch (error) {
      console.error('Error scanning apps:', error);
    }
  }, [externalApps, onAppsChanged]);

  useEffect(() => {
    if (externalApps) return;
    loadApps();
    const timer = setInterval(loadApps, 3000);
    return () => clearInterval(timer);
  }, [loadApps, externalApps]);

  const handleStartDev = async (appId: string) => {
    setBusyId(appId);
    setBusyAction('正在启动...');
    setErrorMsg(null);
    setErrorAppId(null);
    try {
      const result = await window.electron.app.startDev(appId);
      if (!result.success) {
        console.error('Start dev failed:', result.error);
        setErrorMsg(result.error ?? '启动开发服务失败');
        setErrorAppId(appId);
      }
      await loadApps();
    } catch (error) {
      console.error('Error starting dev:', error);
      setErrorMsg(String(error));
      setErrorAppId(appId);
    } finally {
      setBusyId(null);
      setBusyAction(null);
    }
  };

  const handleStopDev = async (appId: string) => {
    try {
      await window.electron.app.stopDev(appId);
      await loadApps();
    } catch (error) {
      console.error('Error stopping dev:', error);
    }
  };

  const handlePublish = async (appId: string) => {
    setBusyId(appId);
    setBusyAction('正在发布...');
    setErrorMsg(null);
    setErrorAppId(null);
    try {
      const result = await window.electron.app.publish(appId);
      if (!result.success) {
        console.error('Publish failed:', result.error);
        setErrorMsg(result.error ?? '发布失败');
        setErrorAppId(appId);
      }
      await loadApps();
    } catch (error) {
      console.error('Error publishing app:', error);
      setErrorMsg(String(error));
      setErrorAppId(appId);
    } finally {
      setBusyId(null);
      setBusyAction(null);
    }
  };

  const handleStop = async (appId: string) => {
    try {
      await window.electron.app.stop(appId);
      await loadApps();
    } catch (error) {
      console.error('Error stopping app:', error);
    }
  };

  const handleCopyUrl = (url: string) => {
    navigator.clipboard.writeText(url).catch(() => {});
  };

  const handleOpenPreview = (url: string) => {
    window.electron.shell.openExternal(url).catch(() => {});
  };

  if (apps.length === 0) return null;

  return (
    <div className="space-y-1 px-1.5 pb-1">
      {errorMsg && (
        <div className="space-y-1.5 rounded-lg bg-red-50 px-3 py-2 dark:bg-red-900/30">
          <div className="flex items-start gap-2 text-xs text-red-700 dark:text-red-300">
            <span className="min-w-0 flex-1 whitespace-pre-wrap break-all">{errorMsg}</span>
            <button
              onClick={() => {
                setErrorMsg(null);
                setErrorAppId(null);
              }}
              className="shrink-0 text-red-400 hover:text-red-600 dark:hover:text-red-200"
            >
              ✕
            </button>
          </div>
          {onDebugApp && errorAppId && (() => {
            const errorApp = apps.find((a) => a.id === errorAppId);
            return errorApp?.conversationId ? (
              <button
                onClick={() => onDebugApp(errorApp.conversationId!, errorMsg)}
                className="flex w-full items-center justify-center gap-1 rounded-md bg-red-100 px-2 py-1 text-[10px] font-medium text-red-700 transition-colors hover:bg-red-200 dark:bg-red-900/40 dark:text-red-300 dark:hover:bg-red-900/60"
              >
                <Wrench className="h-3 w-3" />
                让小马修复
              </button>
            ) : null;
          })()}
        </div>
      )}
      {apps.map((app) => (
        <div key={app.id} className="rounded-lg bg-white px-2.5 py-2 shadow-sm dark:bg-neutral-800">
          <div className="flex items-center gap-1.5">
            <span className="text-sm">{app.icon}</span>
            <span className="min-w-0 flex-1 truncate text-xs font-medium text-neutral-800 dark:text-neutral-200">
              {app.name}
            </span>
            {onOpenDbViewer && (
              <button
                onClick={() => onOpenDbViewer(app.id, app.name)}
                className="shrink-0 rounded p-0.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-indigo-600 dark:hover:bg-neutral-700 dark:hover:text-indigo-400"
                title="查看数据"
              >
                <Database className="h-3 w-3" />
              </button>
            )}
            {app.status === 'running' && (
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-green-500" />
            )}
            {app.status === 'developing' && (
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
            )}
            {(app.status === 'installing' || app.status === 'building') && (
              <Loader2 className="h-3 w-3 shrink-0 animate-spin text-amber-500" />
            )}
          </div>

          {app.description && (
            <p className="mt-0.5 line-clamp-1 text-[10px] text-neutral-500 dark:text-neutral-400">
              {app.description}
            </p>
          )}

          {renderAppActions(app)}
        </div>
      ))}
    </div>
  );

  function renderAppActions(app: AppInfo) {
    const isBusy = busyId === app.id;

    // Transitional states
    if (app.status === 'installing' || app.status === 'building') {
      return (
        <div className="mt-1.5 flex items-center justify-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-[10px] text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
          <Loader2 className="h-3 w-3 animate-spin" />
          {app.status === 'installing' && '正在安装依赖...'}
          {app.status === 'building' && '正在构建...'}
        </div>
      );
    }

    // Developing state (Vite dev server running)
    if (app.status === 'developing') {
      return (
        <div className="mt-1.5 space-y-1">
          {app.lanUrl && (
            <div className="flex items-center gap-1 rounded bg-blue-50 px-1.5 py-0.5 dark:bg-blue-900/20">
              <Code className="h-2.5 w-2.5 shrink-0 text-blue-500" />
              <code className="min-w-0 flex-1 truncate text-[9px] text-blue-600 dark:text-blue-300">
                {app.lanUrl}
              </code>
              <button
                onClick={() => handleCopyUrl(app.lanUrl!)}
                className="shrink-0 p-0.5 text-blue-400 hover:text-blue-600 dark:hover:text-blue-200"
                title="复制链接"
              >
                <Copy className="h-2.5 w-2.5" />
              </button>
            </div>
          )}
          <div className="flex gap-1">
            {app.localUrl && (
              <button
                onClick={() => handleOpenPreview(app.localUrl!)}
                className="flex flex-1 items-center justify-center gap-1 rounded-md bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 transition-colors hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50"
              >
                <ExternalLink className="h-2.5 w-2.5" />
                预览
              </button>
            )}
            <button
              onClick={() => handlePublish(app.id)}
              disabled={isBusy}
              className="flex flex-1 items-center justify-center gap-1 rounded-md bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700 transition-colors hover:bg-indigo-200 disabled:opacity-50 dark:bg-indigo-900/30 dark:text-indigo-300 dark:hover:bg-indigo-900/50"
            >
              <Hammer className="h-2.5 w-2.5" />
              构建并发布
            </button>
            <button
              onClick={() => handleStopDev(app.id)}
              className="flex items-center justify-center rounded-md bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-600 transition-colors hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/30"
            >
              <Square className="h-2.5 w-2.5" />
            </button>
          </div>
        </div>
      );
    }

    // Running state (published)
    if (app.status === 'running') {
      return (
        <div className="mt-1.5 space-y-1">
          {app.lanUrl && (
            <div className="flex items-center gap-1 rounded bg-neutral-50 px-1.5 py-0.5 dark:bg-neutral-700/50">
              <code className="min-w-0 flex-1 truncate text-[9px] text-neutral-600 dark:text-neutral-300">
                {app.lanUrl}
              </code>
              <button
                onClick={() => handleCopyUrl(app.lanUrl!)}
                className="shrink-0 p-0.5 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
                title="复制链接"
              >
                <Copy className="h-2.5 w-2.5" />
              </button>
            </div>
          )}
          <div className="flex gap-1">
            {app.localUrl && (
              <button
                onClick={() => handleOpenPreview(app.localUrl!)}
                className="flex flex-1 items-center justify-center gap-1 rounded-md bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-600 transition-colors hover:bg-neutral-200 dark:bg-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-600"
              >
                <ExternalLink className="h-2.5 w-2.5" />
                预览
              </button>
            )}
            <button
              onClick={() => handleStop(app.id)}
              className="flex flex-1 items-center justify-center gap-1 rounded-md bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-600 transition-colors hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/30"
            >
              <Square className="h-2.5 w-2.5" />
              停止
            </button>
          </div>
        </div>
      );
    }

    // Stopped state
    return (
      <div className="mt-1.5 flex gap-1">
        <button
          onClick={() => handleStartDev(app.id)}
          disabled={isBusy}
          className="flex flex-1 items-center justify-center gap-1 rounded-md bg-blue-600 px-2 py-1 text-[10px] font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
        >
          {isBusy ?
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              {busyAction}
            </>
          : <>
              <Code className="h-3 w-3" />
              开发
            </>
          }
        </button>
        <button
          onClick={() => handlePublish(app.id)}
          disabled={isBusy}
          className="flex flex-1 items-center justify-center gap-1 rounded-md bg-indigo-600 px-2 py-1 text-[10px] font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
        >
          <Play className="h-3 w-3" />
          发布
        </button>
      </div>
    );
  }
}
