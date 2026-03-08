import { ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Switch } from '@/components/ui/switch';
import type { UpdateChannel } from '@/electron';

import type { ChatModelPreference, CustomModelIds } from '../../shared/types/ipc';
import { DEFAULT_MODEL_NAMES, MODEL_LABELS, MODEL_TOOLTIPS } from '../../shared/types/ipc';

type ApiKeyStatus = {
  configured: boolean;
  source: 'env' | 'local' | null;
  lastFour: string | null;
};

type TestResult = {
  status: 'idle' | 'testing' | 'success' | 'error';
  message?: string;
};

function Settings() {
  const [workspaceDir, setWorkspaceDir] = useState('');
  const [currentWorkspaceDir, setCurrentWorkspaceDir] = useState('');
  const [isLoadingWorkspace, setIsLoadingWorkspace] = useState(true);
  const [isSavingWorkspace, setIsSavingWorkspace] = useState(false);
  const [workspaceSaveStatus, setWorkspaceSaveStatus] = useState<'idle' | 'success' | 'error'>(
    'idle'
  );

  const [debugMode, setDebugMode] = useState(false);
  const [isLoadingDebugMode, setIsLoadingDebugMode] = useState(true);
  const [isSavingDebugMode, setIsSavingDebugMode] = useState(false);

  const [analyticsEnabled, setAnalyticsEnabled] = useState(false);
  const [analyticsShareConversation, setAnalyticsShareConversation] = useState(false);
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(true);
  const [isSavingAnalytics, setIsSavingAnalytics] = useState(false);

  const [isDebugExpanded, setIsDebugExpanded] = useState(false);
  const [pathInfo, setPathInfo] = useState<{
    platform: string;
    pathSeparator: string;
    pathEntries: string[];
    pathCount: number;
    fullPath: string;
  } | null>(null);
  const [isLoadingPathInfo, setIsLoadingPathInfo] = useState(false);
  const [envVars, setEnvVars] = useState<Array<{ key: string; value: string }> | null>(null);
  const [isLoadingEnvVars, setIsLoadingEnvVars] = useState(false);
  const [diagnosticMetadata, setDiagnosticMetadata] = useState<{
    appVersion: string;
    electronVersion: string;
    chromiumVersion: string;
    v8Version: string;
    nodeVersion: string;
    claudeAgentSdkVersion: string;
    platform: string;
    arch: string;
    osRelease: string;
    osType: string;
    osVersion: string;
  } | null>(null);
  const [isLoadingDiagnosticMetadata, setIsLoadingDiagnosticMetadata] = useState(false);
  const [apiKeyStatus, setApiKeyStatus] = useState<ApiKeyStatus>({
    configured: false,
    source: null,
    lastFour: null
  });
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [isSavingApiKey, setIsSavingApiKey] = useState(false);
  const [apiKeySaveState, setApiKeySaveState] = useState<'idle' | 'success' | 'error'>('idle');

  const [apiBaseUrl, setApiBaseUrl] = useState<string>('');
  const [isLoadingBaseUrl, setIsLoadingBaseUrl] = useState(true);
  const [isSavingBaseUrl, setIsSavingBaseUrl] = useState(false);
  const [baseUrlSaveState, setBaseUrlSaveState] = useState<'idle' | 'success' | 'error'>('idle');

  const [customModelId, setCustomModelId] = useState<string>('');
  const [_isLoadingModelId, setIsLoadingModelId] = useState(true);
  const [isSavingModelId, setIsSavingModelId] = useState(false);
  const [modelIdSaveState, setModelIdSaveState] = useState<'idle' | 'success' | 'error'>('idle');

  const [customModelIds, setCustomModelIds] = useState<CustomModelIds>({});
  const [isLoadingModelIds, setIsLoadingModelIds] = useState(true);
  const [isSavingModelIds, setIsSavingModelIds] = useState(false);
  const [modelIdsSaveState, setModelIdsSaveState] = useState<'idle' | 'success' | 'error'>('idle');

  const [testResult, setTestResult] = useState<TestResult>({ status: 'idle' });

  const [updateChannel, setUpdateChannel] = useState<UpdateChannel>('stable');
  const [isLoadingChannel, setIsLoadingChannel] = useState(true);
  const [isSavingChannel, setIsSavingChannel] = useState(false);

  useEffect(() => {
    window.electron.config
      .getWorkspaceDir()
      .then((response) => {
        setCurrentWorkspaceDir(response.workspaceDir);
        setIsLoadingWorkspace(false);
      })
      .catch(() => setIsLoadingWorkspace(false));

    window.electron.config
      .getDebugMode()
      .then((response) => {
        setDebugMode(response.debugMode);
        setIsLoadingDebugMode(false);
      })
      .catch(() => setIsLoadingDebugMode(false));

    window.electron.config
      .getApiKeyStatus()
      .then((response) => setApiKeyStatus(response.status))
      .catch(() => {});

    window.electron.config
      .getApiBaseUrl()
      .then((response) => {
        setApiBaseUrl(response.apiBaseUrl || '');
        setIsLoadingBaseUrl(false);
      })
      .catch(() => setIsLoadingBaseUrl(false));

    window.electron.config
      .getCustomModelId()
      .then((response) => {
        setCustomModelId(response.customModelId || '');
        setIsLoadingModelId(false);
      })
      .catch(() => setIsLoadingModelId(false));

    window.electron.config
      .getCustomModelIds()
      .then((response) => {
        setCustomModelIds(response.customModelIds || {});
        setIsLoadingModelIds(false);
      })
      .catch(() => setIsLoadingModelIds(false));

    window.electron.update
      .getChannel()
      .then((response) => {
        setUpdateChannel(response.channel);
        setIsLoadingChannel(false);
      })
      .catch(() => setIsLoadingChannel(false));

    window.electron.analytics
      .getSettings()
      .then((settings) => {
        setAnalyticsEnabled(settings.enabled);
        setAnalyticsShareConversation(settings.shareConversationOnFeedback);
        setIsLoadingAnalytics(false);
      })
      .catch(() => setIsLoadingAnalytics(false));
  }, []);

  const loadPathInfo = async () => {
    setIsLoadingPathInfo(true);
    try {
      const info = await window.electron.config.getPathInfo();
      setPathInfo(info);
    } catch {
      // Ignore errors
    } finally {
      setIsLoadingPathInfo(false);
    }
  };

  const loadEnvVars = async () => {
    setIsLoadingEnvVars(true);
    try {
      const response = await window.electron.config.getEnvVars();
      setEnvVars(response.envVars);
    } catch {
      // Ignore errors
    } finally {
      setIsLoadingEnvVars(false);
    }
  };

  const loadDiagnosticMetadata = async () => {
    setIsLoadingDiagnosticMetadata(true);
    try {
      const metadata = await window.electron.config.getDiagnosticMetadata();
      setDiagnosticMetadata(metadata);
    } catch {
      // Ignore errors
    } finally {
      setIsLoadingDiagnosticMetadata(false);
    }
  };

  useEffect(() => {
    if (isDebugExpanded) {
      if (!pathInfo) loadPathInfo();
      if (!envVars) loadEnvVars();
      if (!diagnosticMetadata) loadDiagnosticMetadata();
    }
  }, [isDebugExpanded, pathInfo, envVars, diagnosticMetadata]);


  const handleSaveWorkspace = async () => {
    setIsSavingWorkspace(true);
    setWorkspaceSaveStatus('idle');
    try {
      const response = await window.electron.config.setWorkspaceDir(workspaceDir);
      if (response.success) {
        setWorkspaceSaveStatus('success');
        setWorkspaceDir('');
        const workspaceResponse = await window.electron.config.getWorkspaceDir();
        setCurrentWorkspaceDir(workspaceResponse.workspaceDir);
        setTimeout(() => setWorkspaceSaveStatus('idle'), 2000);
      } else {
        setWorkspaceSaveStatus('error');
        setTimeout(() => setWorkspaceSaveStatus('idle'), 3000);
      }
    } catch {
      setWorkspaceSaveStatus('error');
      setTimeout(() => setWorkspaceSaveStatus('idle'), 3000);
    } finally {
      setIsSavingWorkspace(false);
    }
  };

  const handleToggleDebugMode = async () => {
    setIsSavingDebugMode(true);
    const newValue = !debugMode;
    const previousValue = debugMode;
    try {
      await window.electron.config.setDebugMode(newValue);
      setDebugMode(newValue);
    } catch {
      setDebugMode(previousValue);
    } finally {
      setIsSavingDebugMode(false);
    }
  };

  const handleSaveApiKey = async () => {
    setIsSavingApiKey(true);
    setApiKeySaveState('idle');
    try {
      const response = await window.electron.config.setApiKey(apiKeyInput);
      setApiKeyStatus(response.status);
      setApiKeyInput('');
      setApiKeySaveState('success');
      setTimeout(() => setApiKeySaveState('idle'), 2000);
    } catch {
      setApiKeySaveState('error');
      setTimeout(() => setApiKeySaveState('idle'), 2500);
    } finally {
      setIsSavingApiKey(false);
    }
  };

  const handleClearStoredApiKey = async () => {
    setIsSavingApiKey(true);
    setApiKeySaveState('idle');
    try {
      const response = await window.electron.config.setApiKey(null);
      setApiKeyStatus(response.status);
      setApiKeyInput('');
      setApiKeySaveState('success');
      setTimeout(() => setApiKeySaveState('idle'), 2000);
    } catch {
      setApiKeySaveState('error');
      setTimeout(() => setApiKeySaveState('idle'), 2500);
    } finally {
      setIsSavingApiKey(false);
    }
  };

  const handleSaveBaseUrl = async () => {
    setIsSavingBaseUrl(true);
    setBaseUrlSaveState('idle');
    try {
      const response = await window.electron.config.setApiBaseUrl(apiBaseUrl.trim() || null);
      setApiBaseUrl(response.apiBaseUrl || '');
      setBaseUrlSaveState('success');
      setTimeout(() => setBaseUrlSaveState('idle'), 2000);
    } catch {
      setBaseUrlSaveState('error');
      setTimeout(() => setBaseUrlSaveState('idle'), 2500);
    } finally {
      setIsSavingBaseUrl(false);
    }
  };

  const handleSaveModelIds = async () => {
    setIsSavingModelIds(true);
    setModelIdsSaveState('idle');
    try {
      const response = await window.electron.config.setCustomModelIds(customModelIds);
      setCustomModelIds(response.customModelIds || {});
      setModelIdsSaveState('success');
      setTimeout(() => setModelIdsSaveState('idle'), 2000);
    } catch {
      setModelIdsSaveState('error');
      setTimeout(() => setModelIdsSaveState('idle'), 2500);
    } finally {
      setIsSavingModelIds(false);
    }
  };

  const handleSaveModelId = async () => {
    setIsSavingModelId(true);
    setModelIdSaveState('idle');
    try {
      const response = await window.electron.config.setCustomModelId(
        customModelId.trim() || null
      );
      setCustomModelId(response.customModelId || '');
      setModelIdSaveState('success');
      setTimeout(() => setModelIdSaveState('idle'), 2000);
    } catch {
      setModelIdSaveState('error');
      setTimeout(() => setModelIdSaveState('idle'), 2500);
    } finally {
      setIsSavingModelId(false);
    }
  };

  const handleTestApi = async () => {
    setTestResult({ status: 'testing' });
    try {
      // Pass current form values so unsaved changes are also tested
      const response = await window.electron.config.testApi({
        apiKey: apiKeyInput.trim() || undefined,
        baseUrl: apiBaseUrl.trim() || undefined,
        modelId: customModelId.trim() || undefined
      });
      if (response.success) {
        setTestResult({ status: 'success', message: response.message });
      } else {
        setTestResult({ status: 'error', message: response.error });
      }
    } catch {
      setTestResult({ status: 'error', message: '测试请求失败，请检查网络连接' });
    }
  };

  const handleToggleUpdateChannel = async () => {
    setIsSavingChannel(true);
    const newChannel: UpdateChannel = updateChannel === 'stable' ? 'nightly' : 'stable';
    try {
      const response = await window.electron.update.setChannel(newChannel);
      setUpdateChannel(response.channel);
    } catch {
      // Revert on error
    } finally {
      setIsSavingChannel(false);
    }
  };

  const handleToggleAnalytics = async () => {
    setIsSavingAnalytics(true);
    const newValue = !analyticsEnabled;
    try {
      const settings = await window.electron.analytics.setSettings({ enabled: newValue });
      setAnalyticsEnabled(settings.enabled);
    } catch {
      setAnalyticsEnabled(!newValue);
    } finally {
      setIsSavingAnalytics(false);
    }
  };

  const handleToggleShareConversation = async () => {
    setIsSavingAnalytics(true);
    const newValue = !analyticsShareConversation;
    try {
      const settings = await window.electron.analytics.setSettings({
        shareConversationOnFeedback: newValue
      });
      setAnalyticsShareConversation(settings.shareConversationOnFeedback);
    } catch {
      setAnalyticsShareConversation(!newValue);
    } finally {
      setIsSavingAnalytics(false);
    }
  };

  const isFormLoading =
    isLoadingWorkspace || isLoadingDebugMode || isLoadingBaseUrl || isLoadingChannel || isLoadingAnalytics;
  const apiKeyPlaceholder = apiKeyStatus.lastFour ? `...${apiKeyStatus.lastFour}` : 'sk-ant-...';

  // Shared styles
  const inputClass =
    'w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 font-mono text-sm text-neutral-900 placeholder-neutral-400 transition focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400/20 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:placeholder-neutral-500 dark:focus:border-neutral-500';
  const primaryBtnClass =
    'rounded-lg bg-neutral-900 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300';
  const secondaryBtnClass =
    'rounded-lg border border-neutral-200 px-4 py-1.5 text-xs font-medium text-neutral-700 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800';
  const dangerBtnClass =
    'rounded-lg border border-red-200 px-4 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20';

  return (
    <div className="flex h-full flex-col" style={{ background: 'var(--color-content-bg)' }}>
      {/* Titlebar drag region */}
      <div
        className="shrink-0 [-webkit-app-region:drag]"
        style={{ height: 'var(--titlebar-height)' }}
      />

      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
        <h1 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">设置</h1>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 pb-12">
        {isFormLoading ? (
          <div className="flex items-center justify-center py-12 text-xs text-neutral-500 dark:text-neutral-400">
            加载中...
          </div>
        ) : (
          <div className="mx-auto max-w-2xl space-y-6">
            {/* API Key */}
            <section className="space-y-3">
              <div>
                <h2 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
                  API Key
                </h2>
                <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                  在此处设置 API Key，或通过 <code className="text-[11px]">ANTHROPIC_API_KEY</code>{' '}
                  环境变量配置
                </p>
              </div>

              <div className="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-400">
                <span
                  className={
                    apiKeyStatus.configured
                      ? 'font-medium text-neutral-800 dark:text-neutral-200'
                      : 'text-neutral-500'
                  }
                >
                  {apiKeyStatus.configured
                    ? apiKeyStatus.source === 'env'
                      ? '使用环境变量'
                      : '本地存储'
                    : '未配置'}
                </span>
                {apiKeyStatus.lastFour && apiKeyStatus.configured && (
                  <span className="font-mono text-[11px] text-neutral-400">
                    ...{apiKeyStatus.lastFour}
                  </span>
                )}
                {apiKeyStatus.source === 'env' && (
                  <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                    ENV
                  </span>
                )}
              </div>

              <input
                type="password"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder={apiKeyPlaceholder}
                className={inputClass}
              />

              <div className="flex items-center gap-2">
                {apiKeyStatus.source === 'local' && (
                  <button
                    onClick={handleClearStoredApiKey}
                    disabled={isSavingApiKey}
                    className={dangerBtnClass}
                  >
                    清除
                  </button>
                )}
                <button
                  onClick={handleSaveApiKey}
                  disabled={!apiKeyInput.trim() || isSavingApiKey}
                  className={primaryBtnClass}
                >
                  {isSavingApiKey ? '保存中...' : '保存'}
                </button>
                {apiKeySaveState === 'success' && (
                  <span className="text-[11px] text-green-600 dark:text-green-400">已保存</span>
                )}
                {apiKeySaveState === 'error' && (
                  <span className="text-[11px] text-red-600 dark:text-red-400">保存失败</span>
                )}
              </div>
            </section>

            <div className="border-t border-neutral-100 dark:border-neutral-800" />

            {/* API Base URL */}
            <section className="space-y-3">
              <div>
                <h2 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
                  API 地址
                </h2>
                <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                  兼容 Anthropic 的 API 端点地址，留空使用默认地址
                </p>
              </div>
              <input
                type="text"
                value={apiBaseUrl}
                onChange={(e) => setApiBaseUrl(e.target.value)}
                placeholder="https://api.example.com/anthropic"
                className={inputClass}
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSaveBaseUrl}
                  disabled={isSavingBaseUrl}
                  className={primaryBtnClass}
                >
                  {isSavingBaseUrl ? '保存中...' : '保存'}
                </button>
                {baseUrlSaveState === 'success' && (
                  <span className="text-[11px] text-green-600 dark:text-green-400">已保存</span>
                )}
                {baseUrlSaveState === 'error' && (
                  <span className="text-[11px] text-red-600 dark:text-red-400">保存失败</span>
                )}
              </div>
            </section>

            <div className="border-t border-neutral-100 dark:border-neutral-800" />

            {/* Test Connection */}
            <section className="space-y-3">
              <div>
                <h2 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
                  连接测试
                </h2>
                <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                  测试当前配置的 API Key、地址和模型是否可用
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleTestApi}
                  disabled={testResult.status === 'testing'}
                  className={secondaryBtnClass}
                >
                  {testResult.status === 'testing' ? (
                    <span className="flex items-center gap-1.5">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      测试中...
                    </span>
                  ) : (
                    '测试连接'
                  )}
                </button>
                {testResult.status === 'success' && testResult.message && (
                  <span className="text-[11px] text-green-600 dark:text-green-400">
                    {testResult.message}
                  </span>
                )}
              </div>
              {testResult.status === 'error' && testResult.message && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
                  {testResult.message}
                </div>
              )}
            </section>

            <div className="border-t border-neutral-100 dark:border-neutral-800" />

            {/* Per-tier Model Configuration */}
            <section className="space-y-3">
              <div>
                <h2 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
                  模型配置
                </h2>
                <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                  {'分别设置「快速」「均衡」「强力」三个档位使用的 AI 模型，留空则使用默认模型'}
                </p>
              </div>
              {isLoadingModelIds ? (
                <p className="text-xs text-neutral-500 dark:text-neutral-400">加载中...</p>
              ) : (
                <div className="space-y-3">
                  {(['fast', 'smart-sonnet', 'smart-opus'] as ChatModelPreference[]).map((pref) => (
                    <div key={pref} className="space-y-1.5">
                      <div className="flex items-baseline gap-2">
                        <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                          {MODEL_LABELS[pref]}
                        </label>
                        <span className="text-[10px] text-neutral-400 dark:text-neutral-500">
                          {MODEL_TOOLTIPS[pref].description}
                        </span>
                      </div>
                      <input
                        type="text"
                        value={customModelIds[pref] || ''}
                        onChange={(e) =>
                          setCustomModelIds((prev) => ({ ...prev, [pref]: e.target.value }))
                        }
                        placeholder={`默认：${DEFAULT_MODEL_NAMES[pref]}`}
                        className={inputClass}
                      />
                      <p className="text-[10px] text-neutral-400 dark:text-neutral-500">
                        推荐：{MODEL_TOOLTIPS[pref].suggestions.join('、')}
                      </p>
                    </div>
                  ))}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleSaveModelIds}
                      disabled={isSavingModelIds}
                      className={primaryBtnClass}
                    >
                      {isSavingModelIds ? '保存中...' : '保存'}
                    </button>
                    {modelIdsSaveState === 'success' && (
                      <span className="text-[11px] text-green-600 dark:text-green-400">已保存</span>
                    )}
                    {modelIdsSaveState === 'error' && (
                      <span className="text-[11px] text-red-600 dark:text-red-400">保存失败</span>
                    )}
                  </div>
                </div>
              )}
            </section>

            <div className="border-t border-neutral-100 dark:border-neutral-800" />

            {/* Workspace Directory */}
            <section className="space-y-3">
              <div>
                <h2 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
                  工作目录
                </h2>
                <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                  文件读写的工作目录，默认: Desktop/ma-agent
                </p>
              </div>
              {currentWorkspaceDir && (
                <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 font-mono text-xs text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400">
                  {currentWorkspaceDir}
                </div>
              )}
              <input
                type="text"
                value={workspaceDir}
                onChange={(e) => setWorkspaceDir(e.target.value)}
                placeholder={currentWorkspaceDir || '/path/to/workspace'}
                className={inputClass}
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSaveWorkspace}
                  disabled={!workspaceDir.trim() || isSavingWorkspace}
                  className={primaryBtnClass}
                >
                  {isSavingWorkspace ? '保存中...' : '保存'}
                </button>
                {workspaceSaveStatus === 'success' && (
                  <span className="text-[11px] text-green-600 dark:text-green-400">已更新</span>
                )}
                {workspaceSaveStatus === 'error' && (
                  <span className="text-[11px] text-red-600 dark:text-red-400">更新失败</span>
                )}
              </div>
            </section>

            <div className="border-t border-neutral-100 dark:border-neutral-800" />

            {/* Update Channel */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
                    更新通道
                  </h2>
                  <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                    {updateChannel === 'stable'
                      ? '仅接收稳定版本更新'
                      : '接收 main 分支的每日构建（可能不稳定）'}
                  </p>
                </div>
                <Switch
                  checked={updateChannel === 'stable'}
                  onCheckedChange={() => handleToggleUpdateChannel()}
                  disabled={isSavingChannel}
                />
              </div>
            </section>

            <div className="border-t border-neutral-100 dark:border-neutral-800" />

            {/* Analytics & Privacy */}
            <section className="space-y-3">
              <div>
                <h2 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
                  数据与隐私
                </h2>
                <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                  控制匿名使用统计和反馈数据的收集
                </p>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                    发送匿名使用统计
                  </p>
                  <p className="mt-0.5 text-[11px] text-neutral-400 dark:text-neutral-500">
                    帮助我们改进产品，仅收集功能使用频率
                  </p>
                </div>
                <Switch
                  checked={analyticsEnabled}
                  onCheckedChange={() => handleToggleAnalytics()}
                  disabled={isSavingAnalytics}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                    反馈时分享脱敏后的对话内容
                  </p>
                  <p className="mt-0.5 text-[11px] text-neutral-400 dark:text-neutral-500">
                    点踩时，AI 会先去除隐私信息再上报对话内容（即将推出）
                  </p>
                </div>
                <Switch
                  checked={analyticsShareConversation}
                  onCheckedChange={() => handleToggleShareConversation()}
                  disabled={isSavingAnalytics || !analyticsEnabled}
                />
              </div>
            </section>

            <div className="border-t border-neutral-100 dark:border-neutral-800" />

            {/* Debug Mode */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
                    调试模式
                  </h2>
                  <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                    {debugMode
                      ? '调试输出会随对话内容一同显示'
                      : '关闭后对话界面更简洁'}
                  </p>
                </div>
                <Switch
                  checked={debugMode}
                  onCheckedChange={() => handleToggleDebugMode()}
                  disabled={isSavingDebugMode}
                />
              </div>
            </section>

            <div className="border-t border-neutral-100 dark:border-neutral-800" />

            {/* Developer / Debug Info */}
            <section>
              <button
                onClick={() => {
                  setIsDebugExpanded(!isDebugExpanded);
                  if (!isDebugExpanded) {
                    loadPathInfo();
                    loadEnvVars();
                  }
                }}
                aria-expanded={isDebugExpanded}
                className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-medium text-neutral-600 transition hover:bg-neutral-50 dark:text-neutral-400 dark:hover:bg-neutral-800"
              >
                <span>开发者信息</span>
                {isDebugExpanded ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
              </button>
              {isDebugExpanded && (
                <div className="mt-2 space-y-4 rounded-lg border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-800/50">
                  {/* Custom Model ID */}
                  <div className="space-y-2">
                    <p className="text-[10px] font-semibold tracking-widest text-neutral-400 uppercase dark:text-neutral-500">
                      自定义模型
                    </p>
                    <p className="text-[10px] text-neutral-400 dark:text-neutral-500">
                      填写后将替换聊天页面的快速/均衡/强力三档选择
                    </p>
                    <input
                      type="text"
                      value={customModelId}
                      onChange={(e) => setCustomModelId(e.target.value)}
                      placeholder={_isLoadingModelId ? '加载中...' : '留空使用默认模型'}
                      disabled={_isLoadingModelId}
                      className={inputClass}
                    />
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleSaveModelId}
                        disabled={isSavingModelId || _isLoadingModelId}
                        className={primaryBtnClass}
                      >
                        {isSavingModelId ? '保存中...' : '保存'}
                      </button>
                      {modelIdSaveState === 'success' && (
                        <span className="text-[11px] text-green-600 dark:text-green-400">已保存</span>
                      )}
                      {modelIdSaveState === 'error' && (
                        <span className="text-[11px] text-red-600 dark:text-red-400">保存失败</span>
                      )}
                    </div>
                  </div>

                  <div className="border-t border-neutral-200 dark:border-neutral-700" />

                  {/* App Information */}
                  <div className="space-y-2">
                    <p className="text-[10px] font-semibold tracking-widest text-neutral-400 uppercase dark:text-neutral-500">
                      应用信息
                    </p>
                    {isLoadingDiagnosticMetadata ? (
                      <p className="text-xs text-neutral-500">加载中...</p>
                    ) : diagnosticMetadata ? (
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          ['版本', diagnosticMetadata.appVersion],
                          ['Electron', diagnosticMetadata.electronVersion],
                          ['Chromium', diagnosticMetadata.chromiumVersion],
                          ['Node.js', diagnosticMetadata.nodeVersion],
                          ['V8', diagnosticMetadata.v8Version],
                          ['SDK', diagnosticMetadata.claudeAgentSdkVersion],
                          [
                            '平台',
                            `${diagnosticMetadata.platform} (${diagnosticMetadata.arch})`
                          ],
                          ['系统', diagnosticMetadata.osType],
                          ['系统版本', diagnosticMetadata.osRelease]
                        ].map(([label, value]) => (
                          <div key={label}>
                            <p className="text-[10px] text-neutral-400 dark:text-neutral-500">
                              {label}
                            </p>
                            <p className="font-mono text-[11px] text-neutral-700 dark:text-neutral-300">
                              {value}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-neutral-500">加载失败</p>
                    )}
                  </div>

                  <div className="border-t border-neutral-200 dark:border-neutral-700" />

                  {/* PATH */}
                  <div className="space-y-2">
                    <p className="text-[10px] font-semibold tracking-widest text-neutral-400 uppercase dark:text-neutral-500">
                      PATH
                    </p>
                    {isLoadingPathInfo ? (
                      <p className="text-xs text-neutral-500">加载中...</p>
                    ) : pathInfo ? (
                      <div className="space-y-1">
                        <p className="text-[10px] text-neutral-400">
                          {pathInfo.platform} -- {pathInfo.pathCount} 条
                        </p>
                        <div className="max-h-48 overflow-y-auto rounded border border-neutral-200 bg-white px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900">
                          {pathInfo.pathEntries.map((entry, i) => (
                            <div
                              key={i}
                              className="font-mono text-[10px] text-neutral-600 dark:text-neutral-400"
                            >
                              <span className="text-neutral-300 dark:text-neutral-600">
                                {String(i + 1).padStart(3)}.
                              </span>{' '}
                              {entry}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-neutral-500">加载失败</p>
                    )}
                  </div>

                  <div className="border-t border-neutral-200 dark:border-neutral-700" />

                  {/* Environment Variables */}
                  <div className="space-y-2">
                    <p className="text-[10px] font-semibold tracking-widest text-neutral-400 uppercase dark:text-neutral-500">
                      环境变量
                    </p>
                    {isLoadingEnvVars ? (
                      <p className="text-xs text-neutral-500">加载中...</p>
                    ) : envVars ? (
                      <div className="space-y-1">
                        <p className="text-[10px] text-neutral-400">{envVars.length} 条</p>
                        <div className="max-h-48 overflow-y-auto rounded border border-neutral-200 bg-white px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900">
                          {envVars.map((v, i) => (
                            <div
                              key={i}
                              className="font-mono text-[10px] text-neutral-600 dark:text-neutral-400"
                            >
                              <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                                {v.key}
                              </span>{' '}
                              = {v.value}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-neutral-500">加载失败</p>
                    )}
                  </div>
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

export default Settings;
