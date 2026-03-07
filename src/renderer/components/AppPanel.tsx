import { Copy, ExternalLink, Globe, Loader2, Play, Square } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import type { AppInfo } from '@/electron';

export default function AppPanel() {
  const [apps, setApps] = useState<AppInfo[]>([]);
  const [publishingId, setPublishingId] = useState<string | null>(null);

  const loadApps = useCallback(async () => {
    try {
      const response = await window.electron.app.scan();
      if (response.success) {
        setApps(response.apps);
      }
    } catch (error) {
      console.error('Error scanning apps:', error);
    }
  }, []);

  useEffect(() => {
    loadApps();
    const timer = setInterval(loadApps, 3000);
    return () => clearInterval(timer);
  }, [loadApps]);

  const handlePublish = async (appId: string) => {
    setPublishingId(appId);
    try {
      const result = await window.electron.app.publish(appId);
      if (!result.success) {
        console.error('Publish failed:', result.error);
      }
      await loadApps();
    } catch (error) {
      console.error('Error publishing app:', error);
    } finally {
      setPublishingId(null);
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
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-3 pt-2 pb-1.5">
        <span className="text-[10px] font-semibold tracking-wider text-neutral-400 uppercase dark:text-neutral-500">
          Apps
        </span>
        <Globe className="h-3 w-3 text-neutral-400 dark:text-neutral-500" />
      </div>

      <div className="space-y-1 px-1.5 pb-2">
        {apps.map((app) => (
          <div
            key={app.id}
            className="rounded-lg bg-white px-2.5 py-2 shadow-sm dark:bg-neutral-800"
          >
            <div className="flex items-center gap-1.5">
              <span className="text-sm">{app.icon}</span>
              <span className="min-w-0 flex-1 truncate text-xs font-medium text-neutral-800 dark:text-neutral-200">
                {app.name}
              </span>
              {app.status === 'running' && (
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-green-500" />
              )}
            </div>

            {app.description && (
              <p className="mt-0.5 line-clamp-1 text-[10px] text-neutral-500 dark:text-neutral-400">
                {app.description}
              </p>
            )}

            {app.status === 'stopped' ?
              <button
                onClick={() => handlePublish(app.id)}
                disabled={publishingId === app.id}
                className="mt-1.5 flex w-full items-center justify-center gap-1 rounded-md bg-indigo-600 px-2 py-1 text-[10px] font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
              >
                {publishingId === app.id ?
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Publishing...
                  </>
                : <>
                    <Play className="h-3 w-3" />
                    Publish to LAN
                  </>
                }
              </button>
            : <div className="mt-1.5 space-y-1">
                {app.lanUrl && (
                  <div className="flex items-center gap-1 rounded bg-neutral-50 px-1.5 py-0.5 dark:bg-neutral-700/50">
                    <code className="min-w-0 flex-1 truncate text-[9px] text-neutral-600 dark:text-neutral-300">
                      {app.lanUrl}
                    </code>
                    <button
                      onClick={() => handleCopyUrl(app.lanUrl!)}
                      className="shrink-0 p-0.5 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
                      title="Copy URL"
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
                      Preview
                    </button>
                  )}
                  <button
                    onClick={() => handleStop(app.id)}
                    className="flex flex-1 items-center justify-center gap-1 rounded-md bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-600 transition-colors hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/30"
                  >
                    <Square className="h-2.5 w-2.5" />
                    Stop
                  </button>
                </div>
              </div>
            }
          </div>
        ))}
      </div>
    </div>
  );
}
