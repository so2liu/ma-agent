import { Loader2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { Switch } from '@/components/ui/switch';

import type { FeishuConfig, FeishuConnectionStatus } from '../../../main/lib/feishu/types';

const createEmptyConfig = (): FeishuConfig => ({
  enabled: false,
  appId: '',
  appSecret: ''
});

type SaveState = 'idle' | 'success' | 'error';

export function FeishuSettings() {
  const [config, setConfig] = useState<FeishuConfig>(createEmptyConfig);
  const [status, setStatus] = useState<FeishuConnectionStatus>('disconnected');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadFeishuState = useCallback(async () => {
    setIsLoading(true);
    try {
      const [savedConfig, connectionStatus] = await Promise.all([
        window.electron.feishu.getConfig(),
        window.electron.feishu.getStatus()
      ]);

      setConfig(savedConfig ?? createEmptyConfig());
      setStatus(connectionStatus);
    } catch {
      setConfig(createEmptyConfig());
      setStatus('disconnected');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFeishuState();
  }, [loadFeishuState]);

  const missingFields = [
    !config.appId.trim() ? 'App ID' : null,
    !config.appSecret.trim() ? 'App Secret' : null
  ].filter((field): field is string => field !== null);

  const isConfigComplete = missingFields.length === 0;
  const toggleChecked = isConfigComplete ? config.enabled : false;
  const toggleDisabled = isLoading || isSaving || !isConfigComplete;
  const statusLabel =
    status === 'connected' ? '已连接'
    : status === 'connecting' ? '连接中'
    : '未连接';
  const statusDotClass =
    status === 'connected' ? 'bg-green-500'
    : 'bg-neutral-300 dark:bg-neutral-600';

  const inputClass =
    'w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 font-mono text-sm text-neutral-900 placeholder-neutral-400 transition focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400/20 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:placeholder-neutral-500 dark:focus:border-neutral-500';
  const primaryBtnClass =
    'rounded-lg bg-neutral-900 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300';

  const handleSave = async () => {
    setIsSaving(true);
    setSaveState('idle');
    setErrorMessage(null);

    const nextConfig: FeishuConfig = {
      ...config,
      enabled: isConfigComplete ? config.enabled : false,
      appId: config.appId.trim(),
      appSecret: config.appSecret.trim()
    };

    try {
      await window.electron.feishu.setConfig(nextConfig);
      const [savedConfig, connectionStatus] = await Promise.all([
        window.electron.feishu.getConfig(),
        window.electron.feishu.getStatus()
      ]);

      setConfig(savedConfig ?? nextConfig);
      setStatus(connectionStatus);
      setSaveState('success');
      setTimeout(() => setSaveState('idle'), 2000);
    } catch (error) {
      setStatus('disconnected');
      setSaveState('error');
      setErrorMessage(error instanceof Error ? error.message : '保存失败，请稍后重试');
      setTimeout(() => setSaveState('idle'), 2500);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
            飞书机器人
          </h2>
          <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
            配置飞书机器人的凭证，并控制 WebSocket 长连接的启停
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-[11px] text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
          <span className={`h-2 w-2 rounded-full ${statusDotClass}`} />
          <span>{statusLabel}</span>
        </div>
      </div>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
            App ID
          </label>
          <input
            type="text"
            value={config.appId}
            onChange={(event) =>
              setConfig((current) => ({ ...current, appId: event.target.value }))
            }
            placeholder="cli_xxxxxxxxxxxxxxxx"
            disabled={isLoading || isSaving}
            className={inputClass}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
            App Secret
          </label>
          <input
            type="password"
            value={config.appSecret}
            onChange={(event) =>
              setConfig((current) => ({ ...current, appSecret: event.target.value }))
            }
            placeholder="输入飞书应用密钥"
            disabled={isLoading || isSaving}
            className={inputClass}
          />
        </div>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 dark:border-neutral-700 dark:bg-neutral-800">
        <div>
          <p className="text-xs font-medium text-neutral-700 dark:text-neutral-300">启用机器人</p>
          <p className="mt-0.5 text-[11px] text-neutral-400 dark:text-neutral-500">
            {isConfigComplete ?
              '保存后会根据开关状态启动或停止飞书机器人'
            : `请先填写 ${missingFields.join('、')}`}
          </p>
        </div>
        <Switch
          checked={toggleChecked}
          onCheckedChange={(checked) =>
            setConfig((current) => ({ ...current, enabled: checked }))
          }
          disabled={toggleDisabled}
        />
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={handleSave}
          disabled={isLoading || isSaving}
          className={primaryBtnClass}
        >
          {isSaving ?
            <span className="flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" />
              保存中...
            </span>
          : '保存'}
        </button>
        {saveState === 'success' && (
          <span className="text-[11px] text-green-600 dark:text-green-400">已保存</span>
        )}
        {saveState === 'error' && (
          <span className="text-[11px] text-red-600 dark:text-red-400">保存失败</span>
        )}
      </div>

      {errorMessage && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {errorMessage}
        </div>
      )}
    </div>
  );
}
