import {
  ChevronDown,
  ChevronUp,
  Cpu,
  FolderOpen,
  Loader2,
  MessageCircle,
  RefreshCw,
  Shield,
  Settings2,
  Sparkles,
  Terminal,
  Wrench
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Switch } from '@/components/ui/switch';
import { FeishuSettings } from '@/components/settings/FeishuSettings';
import type { UpdateChannel } from '@/electron';

import type {
  ChatModelPreference,
  CustomModelIds,
  LlmProvider,
  OpenAIConfig,
  ParsedApiConfig
} from '../../shared/types/ipc';
import {
  DEFAULT_MODEL_NAMES,
  DEFAULT_OPENAI_MODEL_NAMES,
  MODEL_LABELS,
  MODEL_TOOLTIPS
} from '../../shared/types/ipc';

const TIER_KEYS: ChatModelPreference[] = ['fast', 'smart-sonnet', 'smart-opus'];
const TIER_LABELS: Record<ChatModelPreference, string> = {
  fast: '快速',
  'smart-sonnet': '均衡',
  'smart-opus': '强力'
};

const LLM_PROVIDER_LABELS: Record<LlmProvider, string> = {
  anthropic: 'Anthropic 兼容',
  openai: 'OpenAI 兼容'
};

const NAV_ITEMS = [
  { id: 'ai-config', label: 'AI 服务配置', icon: Cpu },
  { id: 'workspace', label: '工作目录', icon: FolderOpen },
  { id: 'update', label: '更新通道', icon: RefreshCw },
  { id: 'privacy', label: '数据与隐私', icon: Shield },
  { id: 'feishu', label: '飞书机器人', icon: MessageCircle },
  { id: 'debug', label: '调试模式', icon: Terminal },
  { id: 'developer', label: '开发者信息', icon: Wrench }
] as const;

type ConfigMode = 'auto' | 'manual';
type AutoConfigStatus = 'idle' | 'parsing' | 'parsed' | 'detecting' | 'saving' | 'success' | 'error';

type StepStatus = 'running' | 'done' | 'error';
interface AutoConfigStep {
  label: string;
  status: StepStatus;
  detail?: string;
}

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

  const [openaiApiKeyInput, setOpenaiApiKeyInput] = useState('');
  const [openaiApiKeyConfigured, setOpenaiApiKeyConfigured] = useState(false);
  const [openaiApiKeySource, setOpenaiApiKeySource] = useState<'env' | 'local' | null>(null);
  const [openaiApiKeyLastFour, setOpenaiApiKeyLastFour] = useState<string | null>(null);
  const [openaiBaseUrl, setOpenaiBaseUrl] = useState('');
  const [openaiModelId, setOpenaiModelId] = useState('');
  const [isLoadingOpenAI, setIsLoadingOpenAI] = useState(true);
  const [isSavingOpenAI, setIsSavingOpenAI] = useState(false);
  const [openaiSaveState, setOpenaiSaveState] = useState<'idle' | 'success' | 'error'>('idle');
  const [openaiTestResult, setOpenaiTestResult] = useState<TestResult>({ status: 'idle' });

  const [testResult, setTestResult] = useState<TestResult>({ status: 'idle' });

  // Auto config state
  const [configMode, setConfigMode] = useState<ConfigMode>('auto');
  const [autoConfigText, setAutoConfigText] = useState('');
  const [autoConfigStatus, setAutoConfigStatus] = useState<AutoConfigStatus>('idle');
  const [parsedConfig, setParsedConfig] = useState<ParsedApiConfig | null>(null);
  const [detectedProvider, setDetectedProvider] = useState<LlmProvider | null>(null);
  const [detectedModel, setDetectedModel] = useState<string | null>(null);
  const [autoConfigError, setAutoConfigError] = useState<string | null>(null);
  const [autoConfigSteps, setAutoConfigSteps] = useState<AutoConfigStep[]>([]);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [tierModels, setTierModels] = useState<Partial<Record<ChatModelPreference, string>>>({});
  const [isRecommending, setIsRecommending] = useState(false);

  const [updateChannel, setUpdateChannel] = useState<UpdateChannel>('stable');
  const [isLoadingChannel, setIsLoadingChannel] = useState(true);
  const [isSavingChannel, setIsSavingChannel] = useState(false);

  // Navigation sidebar
  const [activeSection, setActiveSection] = useState('ai-config');
  const contentRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const isScrollingRef = useRef(false);

  const scrollToSection = useCallback((sectionId: string) => {
    const el = sectionRefs.current[sectionId];
    if (el && contentRef.current) {
      isScrollingRef.current = true;
      const containerTop = contentRef.current.getBoundingClientRect().top;
      const elTop = el.getBoundingClientRect().top;
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      contentRef.current.scrollTo({
        top: contentRef.current.scrollTop + (elTop - containerTop) - 12,
        behavior: prefersReducedMotion ? 'auto' : 'smooth'
      });
      // Re-enable scroll tracking after animation settles
      setTimeout(() => { isScrollingRef.current = false; }, prefersReducedMotion ? 50 : 400);
    }
  }, []);

  // Track active section on scroll
  useEffect(() => {
    const container = contentRef.current;
    if (!container) return;
    const handleScroll = () => {
      if (isScrollingRef.current) return;
      const containerTop = container.getBoundingClientRect().top;
      let current: string = NAV_ITEMS[0].id;
      for (const item of NAV_ITEMS) {
        const el = sectionRefs.current[item.id];
        if (el) {
          const elTop = el.getBoundingClientRect().top - containerTop;
          if (elTop <= 40) current = item.id;
        }
      }
      setActiveSection(current);
    };
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

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

    window.electron.config
      .getOpenAIConfig()
      .then((response) => {
        setOpenaiApiKeyConfigured(response.apiKeyConfigured);
        setOpenaiApiKeySource(response.apiKeySource);
        setOpenaiApiKeyLastFour(response.apiKeyLastFour);
        setOpenaiBaseUrl(response.config.baseUrl || '');
        setOpenaiModelId(response.config.modelId || '');
        setIsLoadingOpenAI(false);
      })
      .catch(() => setIsLoadingOpenAI(false));

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
      const response = await window.electron.config.setCustomModelId(customModelId.trim() || null);

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

  const handleSaveOpenAI = async () => {
    setIsSavingOpenAI(true);
    setOpenaiSaveState('idle');
    try {
      const config: OpenAIConfig = {};
      if (openaiApiKeyInput.trim()) config.apiKey = openaiApiKeyInput.trim();
      if (openaiBaseUrl.trim()) config.baseUrl = openaiBaseUrl.trim();
      if (openaiModelId.trim()) config.modelId = openaiModelId.trim();
      await window.electron.config.setOpenAIConfig(config);


      // Refresh status
      const status = await window.electron.config.getOpenAIConfig();
      setOpenaiApiKeyConfigured(status.apiKeyConfigured);
      setOpenaiApiKeySource(status.apiKeySource);
      setOpenaiApiKeyLastFour(status.apiKeyLastFour);
      setOpenaiBaseUrl(status.config.baseUrl || '');
      setOpenaiModelId(status.config.modelId || '');
      setOpenaiApiKeyInput('');
      setOpenaiSaveState('success');
      setTimeout(() => setOpenaiSaveState('idle'), 2000);
    } catch {
      setOpenaiSaveState('error');
      setTimeout(() => setOpenaiSaveState('idle'), 2500);
    } finally {
      setIsSavingOpenAI(false);
    }
  };

  const handleTestOpenAI = async () => {
    setOpenaiTestResult({ status: 'testing' });
    try {
      const response = await window.electron.config.testOpenAIApi({
        apiKey: openaiApiKeyInput.trim() || undefined,
        baseUrl: openaiBaseUrl.trim() || undefined,
        modelId: openaiModelId.trim() || undefined
      });
      if (response.success) {
        setOpenaiTestResult({ status: 'success', message: response.message });
      } else {
        setOpenaiTestResult({ status: 'error', message: response.error });
      }
    } catch {
      setOpenaiTestResult({ status: 'error', message: '测试请求失败，请检查网络连接' });
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

  const handleAutoConfig = async () => {
    if (!autoConfigText.trim()) return;

    setAutoConfigStatus('parsing');
    setAutoConfigError(null);
    setParsedConfig(null);
    setDetectedProvider(null);
    setDetectedModel(null);

    const steps: AutoConfigStep[] = [{ label: '提取 API Key', status: 'running' }];
    setAutoConfigSteps([...steps]);

    const pushStep = (step: AutoConfigStep) => {
      steps.push(step);
      setAutoConfigSteps([...steps]);
    };
    const finishStep = (index: number, patch: Partial<AutoConfigStep>) => {
      steps[index] = { ...steps[index], ...patch };
      setAutoConfigSteps([...steps]);
    };

    try {
      // Step 1 + 2: Parse text (local key extraction + server NLP)
      const parsed = await window.electron.config.parseApiConfig({
        text: autoConfigText.trim()
      });

      // Step 1 result: API Key extraction
      if (parsed.apiKey) {
        finishStep(0, {
          status: 'done',
          detail: `${parsed.apiKey.slice(0, 8)}••••${parsed.apiKey.slice(-4)}`
        });
      } else {
        finishStep(0, { status: 'error', detail: '未识别到 API Key' });
        setAutoConfigStatus('error');
        setAutoConfigError('未能从文本中识别出 API Key，请检查内容或切换到手动模式');
        return;
      }

      // Step 2 result: Server NLP extraction
      const sd = parsed.serverDetail;
      if (sd?.success) {
        const parts: string[] = [];
        if (sd.baseUrl) parts.push(`地址: ${sd.baseUrl}`);
        if (sd.modelId) parts.push(`模型: ${sd.modelId}`);
        pushStep({
          label: '解析服务识别配置',
          status: 'done',
          detail: parts.length ? parts.join(' | ') : '未识别到额外配置'
        });
      } else {
        pushStep({
          label: '解析服务识别配置',
          status: 'error',
          detail: sd?.error || '未知错误'
        });
        // Not fatal if we have apiKey — continue to probe
      }

      if (parsed.error && !parsed.apiKey) {
        setAutoConfigStatus('error');
        setAutoConfigError(
          parsed.error === 'no_valid_info'
            ? '未能从文本中识别出有效的 API 配置信息，请检查内容或切换到手动模式'
            : `解析失败: ${parsed.error}`
        );
        return;
      }

      setParsedConfig(parsed);
      setAutoConfigStatus('detecting');

      pushStep({ label: '测试 API 连接', status: 'running' });
      const detectStepIdx = steps.length - 1;

      // Step 3: Auto-detect provider type
      const detectResult = await window.electron.config.autoDetectProvider({
        apiKey: parsed.apiKey,
        baseUrl: parsed.baseUrl,
        modelId: parsed.modelId
      });

      // Replace the generic "测试 API 连接" with individual probe steps
      finishStep(detectStepIdx, {
        status: detectResult.success ? 'done' : 'error',
        detail: detectResult.success ? '完成' : '失败'
      });

      // Add individual probe results as sub-steps
      for (const probe of detectResult.probes || []) {
        const name = probe.provider === 'anthropic' ? 'Anthropic 接口' : 'OpenAI 接口';
        let detail: string;
        if (probe.success) {
          if (probe.modelCount) {
            detail = `连接成功（${probe.modelCount} 个模型可用）`;
          } else {
            detail = `连接成功${probe.model ? ` — 模型: ${probe.model}` : ''}`;
          }
        } else {
          detail = probe.error || '连接失败';
        }
        pushStep({ label: name, status: probe.success ? 'done' : 'error', detail });
      }

      if (detectResult.success && detectResult.provider) {
        setDetectedProvider(detectResult.provider);
        setDetectedModel(detectResult.model || null);
        setAvailableModels(detectResult.availableModels || []);
        setTierModels({});
        // Use the validated baseUrl from auto-detect (the URL that actually worked)
        if (detectResult.baseUrl) {
          setParsedConfig((prev) => prev ? { ...prev, baseUrl: detectResult.baseUrl } : prev);
        }
        setAutoConfigStatus('parsed');
      } else {
        setAutoConfigStatus('error');
        setAutoConfigError(detectResult.error || '无法连接 API，请检查信息是否正确');
      }
    } catch {
      finishStep(steps.length - 1, { status: 'error', detail: '请求异常' });
      setAutoConfigStatus('error');
      setAutoConfigError('智能识别过程出错，请重试或切换到手动模式');
    }
  };

  const handleConfirmAutoConfig = async () => {
    if (!parsedConfig?.apiKey || !detectedProvider) return;

    setAutoConfigStatus('saving');
    try {
      // Resolve per-tier model IDs: user-selected tierModels > parsed modelId > empty
      const resolvedModelIds: Partial<Record<ChatModelPreference, string>> = {};
      for (const tier of TIER_KEYS) {
        const selected = tierModels[tier];
        if (selected) {
          resolvedModelIds[tier] = selected;
        } else if (parsedConfig.modelId) {
          resolvedModelIds[tier] = parsedConfig.modelId;
        }
      }

      if (detectedProvider === 'anthropic') {
        await window.electron.config.setApiKey(parsedConfig.apiKey);
        await window.electron.config.setApiBaseUrl(parsedConfig.baseUrl || null);
        // Clear stale OpenAI credentials to prevent resolveModel from misrouting
        await window.electron.config.setOpenAIConfig({});
      } else {
        await window.electron.config.setOpenAIConfig({
          apiKey: parsedConfig.apiKey,
          baseUrl: parsedConfig.baseUrl,
          modelId: resolvedModelIds.fast || parsedConfig.modelId
        });
        // Clear stale Anthropic credentials to prevent resolveModel from misrouting
        await window.electron.config.setApiKey(null);
        await window.electron.config.setApiBaseUrl(null);
      }

      await window.electron.config.setCustomModelIds(resolvedModelIds);

      // Refresh UI state
      const keyStatus = await window.electron.config.getApiKeyStatus();
      setApiKeyStatus(keyStatus.status);

      setAutoConfigStatus('success');
      setAutoConfigText('');
    } catch {
      setAutoConfigStatus('error');
      setAutoConfigError('保存配置失败，请重试');
    }
  };

  const handleRecommendModels = async () => {
    if (availableModels.length === 0) return;
    setIsRecommending(true);
    try {
      const result = await window.electron.config.recommendModels({
        models: availableModels
      });
      if (result.error) {
        setAutoConfigError(
          result.error === 'rate_limit_exceeded'
            ? 'AI 推荐请求过于频繁，请稍后再试'
            : `AI 推荐失败: ${result.error}`
        );
      } else {
        setTierModels({
          fast: result.fast,
          'smart-sonnet': result['smart-sonnet'],
          'smart-opus': result['smart-opus']
        });
        setAutoConfigError(null);
      }
    } catch {
      setAutoConfigError('AI 推荐失败，请手动选择');
    } finally {
      setIsRecommending(false);
    }
  };

  const resetAutoConfig = () => {
    setAutoConfigStatus('idle');
    setAutoConfigError(null);
    setParsedConfig(null);
    setDetectedProvider(null);
    setDetectedModel(null);
    setAutoConfigSteps([]);
    setAvailableModels([]);
    setTierModels({});
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
    isLoadingWorkspace ||
    isLoadingDebugMode ||
    isLoadingBaseUrl ||
    isLoadingChannel ||
    isLoadingAnalytics ||
    isLoadingOpenAI;
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

      {/* Two-column layout */}
      <div className="flex min-h-0 flex-1">
        {/* Left navigation sidebar */}
        <nav className="w-44 shrink-0 border-r border-neutral-200 p-3 dark:border-neutral-800">
          <ul className="space-y-0.5">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeSection === item.id;
              return (
                <li key={item.id}>
                  <button
                    onClick={() => {
                      setActiveSection(item.id);
                      scrollToSection(item.id);
                    }}
                    disabled={isFormLoading}
                    className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs transition disabled:opacity-50 ${
                      isActive
                        ? 'bg-neutral-100 font-medium text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100'
                        : 'text-neutral-500 hover:bg-neutral-50 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800/50 dark:hover:text-neutral-300'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    {item.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Right content area */}
        <div ref={contentRef} className="min-w-0 flex-1 overflow-y-auto p-6 pb-12">
          {isFormLoading ?
            <div className="flex items-center justify-center py-12 text-xs text-neutral-500 dark:text-neutral-400">
              加载中...
            </div>
          : <div className="mx-auto max-w-2xl space-y-6">
              {/* AI Service Configuration */}
              <section ref={(el) => { sectionRefs.current['ai-config'] = el; }} className="space-y-3">
              <div>
                <h2 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
                  AI 服务配置
                </h2>
                <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                  配置 AI 模型的连接信息，支持兼容 Anthropic 或 OpenAI 接口的服务
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => { setConfigMode('auto'); resetAutoConfig(); }}
                  className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-medium transition ${
                    configMode === 'auto' ?
                      'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900'
                    : 'border border-neutral-200 text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800'
                  }`}
                >
                  <Sparkles className="h-3 w-3" />
                  智能配置
                </button>
                <button
                  onClick={() => setConfigMode('manual')}
                  className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-medium transition ${
                    configMode === 'manual' ?
                      'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900'
                    : 'border border-neutral-200 text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800'
                  }`}
                >
                  <Settings2 className="h-3 w-3" />
                  手动配置
                </button>
              </div>
            </section>

            <div className="border-t border-neutral-100 dark:border-neutral-800" />

            {configMode === 'auto' ?
              /* Smart Auto Config */
              <section className="space-y-4">
                {autoConfigStatus === 'success' ?
                  <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/20">
                    <p className="text-sm font-medium text-green-800 dark:text-green-300">
                      配置成功
                    </p>
                    <p className="mt-1 text-xs text-green-600 dark:text-green-400">
                      已检测到 {detectedProvider ? LLM_PROVIDER_LABELS[detectedProvider] : ''}，
                      配置已保存
                      {detectedModel ? `，模型: ${detectedModel}` : ''}
                    </p>
                    <button
                      onClick={resetAutoConfig}
                      className={`mt-3 ${secondaryBtnClass}`}
                    >
                      重新配置
                    </button>
                  </div>
                : <>
                    <div>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">
                        将服务商提供的 API 信息粘贴到下方，我们会自动识别并配置
                      </p>
                      <p className="mt-1 text-[11px] text-neutral-400 dark:text-neutral-500">
                        您的 API Key 会在本地自动提取，不会发送到任何外部服务
                      </p>
                    </div>
                    <textarea
                      value={autoConfigText}
                      onChange={(e) => setAutoConfigText(e.target.value)}
                      placeholder={'将 API 配置信息粘贴到这里...\n\n例如：\n您的 API Key 是 sk-xxxx\n请求地址：https://api.example.com\n模型：deepseek-chat'}
                      rows={5}
                      disabled={autoConfigStatus === 'parsing' || autoConfigStatus === 'detecting' || autoConfigStatus === 'saving'}
                      className={`${inputClass} resize-none`}
                    />

                    {/* Action buttons */}
                    <div className="flex items-center gap-2">
                      {autoConfigStatus === 'parsed' || autoConfigStatus === 'saving' ?
                        <>
                          <button
                            onClick={handleConfirmAutoConfig}
                            disabled={autoConfigStatus === 'saving'}
                            className={primaryBtnClass}
                          >
                            {autoConfigStatus === 'saving' ?
                              <span className="flex items-center gap-1.5">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                保存中...
                              </span>
                            : '确认保存'}
                          </button>
                          <button
                            onClick={resetAutoConfig}
                            className={secondaryBtnClass}
                          >
                            重新识别
                          </button>
                        </>
                      : <button
                          onClick={handleAutoConfig}
                          disabled={!autoConfigText.trim() || autoConfigStatus === 'parsing' || autoConfigStatus === 'detecting'}
                          className={primaryBtnClass}
                        >
                          {autoConfigStatus === 'parsing' ?
                            <span className="flex items-center gap-1.5">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              识别中...
                            </span>
                          : autoConfigStatus === 'detecting' ?
                            <span className="flex items-center gap-1.5">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              测试连接...
                            </span>
                          : '智能识别'}
                        </button>
                      }
                    </div>

                    {/* Step-by-step progress log */}
                    {autoConfigSteps.length > 0 && (
                      <div className="space-y-1 text-xs">
                        {autoConfigSteps.map((step, i) => (
                          <div key={i} className="flex items-start gap-1.5">
                            <span className="mt-0.5 shrink-0">
                              {step.status === 'running' ?
                                <Loader2 className="h-3 w-3 animate-spin text-neutral-400" />
                              : step.status === 'done' ?
                                <span className="text-green-500">&#10003;</span>
                              : <span className="text-red-500">&#10007;</span>}
                            </span>
                            <div className="min-w-0">
                              <span className="font-medium text-neutral-700 dark:text-neutral-300">
                                {step.label}
                              </span>
                              {step.detail && (
                                <p className="mt-0.5 break-all text-neutral-500 dark:text-neutral-400">
                                  {step.detail}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Parsed result preview */}
                    {parsedConfig && (autoConfigStatus === 'parsed' || autoConfigStatus === 'saving') && (
                      <div className="space-y-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-700 dark:bg-neutral-800">
                        <p className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                          识别结果
                        </p>
                        <div className="space-y-1.5 text-xs text-neutral-600 dark:text-neutral-400">
                          {parsedConfig.apiKey && (
                            <div className="flex gap-2">
                              <span className="shrink-0 font-medium">API Key:</span>
                              <span className="font-mono">
                                {parsedConfig.apiKey.slice(0, 8)}••••{parsedConfig.apiKey.slice(-4)}
                              </span>
                            </div>
                          )}
                          {parsedConfig.baseUrl && (
                            <div className="flex gap-2">
                              <span className="shrink-0 font-medium">API 地址:</span>
                              <span className="font-mono break-all">{parsedConfig.baseUrl}</span>
                            </div>
                          )}
                          {detectedProvider && (
                            <div className="flex gap-2">
                              <span className="shrink-0 font-medium">接口类型:</span>
                              <span className="rounded bg-neutral-200 px-1.5 py-0.5 text-[10px] font-medium dark:bg-neutral-700">
                                {detectedProvider === 'anthropic' ? 'Anthropic 兼容' : 'OpenAI 兼容'}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Model tier selection */}
                        <div className="space-y-2 border-t border-neutral-200 pt-2 dark:border-neutral-700">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                              模型配置
                            </p>
                            {availableModels.length > 0 && (
                              <button
                                onClick={handleRecommendModels}
                                disabled={isRecommending}
                                className="flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium text-neutral-600 transition-colors hover:bg-neutral-200 dark:text-neutral-400 dark:hover:bg-neutral-700"
                              >
                                {isRecommending ?
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                : <Sparkles className="h-3 w-3" />}
                                AI 推荐
                              </button>
                            )}
                          </div>
                          {TIER_KEYS.map((tier) => (
                            <div key={tier} className="flex items-center gap-2">
                              <label className="w-16 shrink-0 text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
                                {TIER_LABELS[tier]}
                              </label>
                              {availableModels.length > 0 ?
                                <select
                                  value={tierModels[tier] || ''}
                                  onChange={(e) =>
                                    setTierModels((prev) => ({ ...prev, [tier]: e.target.value || undefined }))
                                  }
                                  className="flex-1 rounded border border-neutral-300 bg-white px-2 py-1 font-mono text-[11px] text-neutral-700 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-300"
                                >
                                  <option value="">未指定（使用默认）</option>
                                  {availableModels.map((m) => (
                                    <option key={m} value={m}>{m}</option>
                                  ))}
                                </select>
                              : <input
                                  type="text"
                                  value={tierModels[tier] || ''}
                                  onChange={(e) =>
                                    setTierModels((prev) => ({ ...prev, [tier]: e.target.value || undefined }))
                                  }
                                  placeholder={parsedConfig.modelId || '使用默认模型'}
                                  className="flex-1 rounded border border-neutral-300 bg-white px-2 py-1 font-mono text-[11px] text-neutral-700 placeholder:text-neutral-400 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-300 dark:placeholder:text-neutral-500"
                                />
                              }
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Error message */}
                    {autoConfigStatus === 'error' && autoConfigError && (
                      <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
                        {autoConfigError}
                      </div>
                    )}
                  </>
                }
              </section>
            : null}

            {configMode === 'manual' && (
              <>
                <section className="space-y-3">
                  <div
                    className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-xs text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
                  >
                    <p className="font-medium">模型自动路由规则</p>
                    <p className="mt-1">
                      当前应用会按模型 ID 自动选择对应密钥。Claude 系列模型使用下方 Anthropic 配置，GPT /
                      DeepSeek 等 OpenAI 兼容模型使用下方 OpenAI 配置。
                    </p>
                  </div>
                </section>

                <div className="border-t border-neutral-100 dark:border-neutral-800" />

                {/* Anthropic API Key */}
                <section className="space-y-3">
                  <div>
                    <h2 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
                      Anthropic API Key
                    </h2>
                    <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                      在此处设置 Anthropic API Key，或通过{' '}
                      <code className="text-[11px]">ANTHROPIC_API_KEY</code> 环境变量配置
                    </p>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-400">
                    <span
                      className={
                        apiKeyStatus.configured ?
                          'font-medium text-neutral-800 dark:text-neutral-200'
                        : 'text-neutral-500'
                      }
                    >
                      {apiKeyStatus.configured ?
                        apiKeyStatus.source === 'env' ?
                          '使用环境变量'
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

                {/* Anthropic Base URL */}
                <section className="space-y-3">
                  <div>
                    <h2 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
                      Anthropic API 地址
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

                {/* Anthropic Connection Test */}
                <section className="space-y-3">
                  <div>
                    <h2 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
                      Anthropic 连接测试
                    </h2>
                    <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                      测试当前 Anthropic API Key、地址和模型是否可用
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleTestApi}
                      disabled={testResult.status === 'testing'}
                      className={secondaryBtnClass}
                    >
                      {testResult.status === 'testing' ?
                        <span className="flex items-center gap-1.5">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          测试中...
                        </span>
                      : '测试连接'}
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

                {/* Anthropic Model Configuration */}
                <section className="space-y-3">
                  <div>
                    <h2 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
                      Claude / Anthropic 模型配置
                    </h2>
                    <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                      分别设置「快速」「均衡」「强力」三个档位的 Claude 模型，Pi Agent 也会使用这里的 Claude 模型配置
                    </p>
                  </div>
                  {isLoadingModelIds ?
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">加载中...</p>
                  : <div className="space-y-3">
                      {(['fast', 'smart-sonnet', 'smart-opus'] as ChatModelPreference[]).map(
                        (pref) => (
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
                        )
                      )}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleSaveModelIds}
                          disabled={isSavingModelIds}
                          className={primaryBtnClass}
                        >
                          {isSavingModelIds ? '保存中...' : '保存'}
                        </button>
                        {modelIdsSaveState === 'success' && (
                          <span className="text-[11px] text-green-600 dark:text-green-400">
                            已保存
                          </span>
                        )}
                        {modelIdsSaveState === 'error' && (
                          <span className="text-[11px] text-red-600 dark:text-red-400">
                            保存失败
                          </span>
                        )}
                      </div>
                    </div>
                  }
                </section>

                <>
                  <div className="border-t border-neutral-100 dark:border-neutral-800" />

                  {/* OpenAI Configuration */}
                  <section className="space-y-3">
                    <div>
                      <h2 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
                        OpenAI API Key
                      </h2>
                      <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                        在此处设置 OpenAI API Key，或通过{' '}
                        <code className="text-[11px]">OPENAI_API_KEY</code> 环境变量配置
                      </p>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-400">
                      <span
                        className={
                          openaiApiKeyConfigured ?
                            'font-medium text-neutral-800 dark:text-neutral-200'
                          : 'text-neutral-500'
                        }
                      >
                        {openaiApiKeyConfigured ?
                          openaiApiKeySource === 'env' ?
                            '使用环境变量'
                          : '本地存储'
                        : '未配置'}
                      </span>
                      {openaiApiKeyLastFour && openaiApiKeyConfigured && (
                        <span className="font-mono text-[11px] text-neutral-400">
                          ...{openaiApiKeyLastFour}
                        </span>
                      )}
                      {openaiApiKeySource === 'env' && (
                        <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                          ENV
                        </span>
                      )}
                    </div>

                    <input
                      type="password"
                      value={openaiApiKeyInput}
                      onChange={(e) => setOpenaiApiKeyInput(e.target.value)}
                      placeholder={openaiApiKeyLastFour ? `...${openaiApiKeyLastFour}` : 'sk-...'}
                      className={inputClass}
                    />
                  </section>

                    <div className="border-t border-neutral-100 dark:border-neutral-800" />

                    <section className="space-y-3">
                      <div>
                        <h2 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
                          OpenAI API 地址
                        </h2>
                        <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                          兼容 OpenAI 的 API 端点地址，留空使用默认地址
                        </p>
                      </div>
                      <input
                        type="text"
                        value={openaiBaseUrl}
                        onChange={(e) => setOpenaiBaseUrl(e.target.value)}
                        placeholder="https://api.openai.com"
                        className={inputClass}
                      />
                    </section>

                    <div className="border-t border-neutral-100 dark:border-neutral-800" />

                    <section className="space-y-3">
                      <div>
                        <h2 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
                          OpenAI 模型
                        </h2>
                        <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                          {'填写后 Pi Agent 三个档位都会优先使用这个 OpenAI 模型，留空则使用默认模型（快速: '}
                          {DEFAULT_OPENAI_MODEL_NAMES.fast}
                          {'、均衡: '}
                          {DEFAULT_OPENAI_MODEL_NAMES['smart-sonnet']}
                          {'、强力: '}
                          {DEFAULT_OPENAI_MODEL_NAMES['smart-opus']}
                          {'）'}
                        </p>
                      </div>
                      <input
                        type="text"
                        value={openaiModelId}
                        onChange={(e) => setOpenaiModelId(e.target.value)}
                        placeholder="默认按档位自动选择"
                        className={inputClass}
                      />
                    </section>

                    <div className="border-t border-neutral-100 dark:border-neutral-800" />

                    <section className="space-y-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleSaveOpenAI}
                          disabled={isSavingOpenAI}
                          className={primaryBtnClass}
                        >
                          {isSavingOpenAI ? '保存中...' : '保存'}
                        </button>
                        <button
                          onClick={handleTestOpenAI}
                          disabled={openaiTestResult.status === 'testing'}
                          className={secondaryBtnClass}
                        >
                          {openaiTestResult.status === 'testing' ?
                            <span className="flex items-center gap-1.5">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              测试中...
                            </span>
                          : '测试连接'}
                        </button>
                        {openaiSaveState === 'success' && (
                          <span className="text-[11px] text-green-600 dark:text-green-400">
                            已保存
                          </span>
                        )}
                        {openaiSaveState === 'error' && (
                          <span className="text-[11px] text-red-600 dark:text-red-400">保存失败</span>
                        )}
                        {openaiTestResult.status === 'success' && openaiTestResult.message && (
                          <span className="text-[11px] text-green-600 dark:text-green-400">
                            {openaiTestResult.message}
                          </span>
                        )}
                      </div>
                      {openaiTestResult.status === 'error' && openaiTestResult.message && (
                        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
                          {openaiTestResult.message}
                        </div>
                      )}
                  </section>
                </>
              </>
            )}

            <div className="border-t border-neutral-100 dark:border-neutral-800" />

            {/* Workspace Directory */}
            <section ref={(el) => { sectionRefs.current['workspace'] = el; }} className="space-y-3">
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
            <section ref={(el) => { sectionRefs.current['update'] = el; }} className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
                    更新通道
                  </h2>
                  <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                    {updateChannel === 'stable' ?
                      '仅接收稳定版本更新'
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
            <section ref={(el) => { sectionRefs.current['privacy'] = el; }} className="space-y-3">
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

            <section ref={(el) => { sectionRefs.current['feishu'] = el; }} className="space-y-3">
              <FeishuSettings />
            </section>

            <div className="border-t border-neutral-100 dark:border-neutral-800" />

            {/* Debug Mode */}
            <section ref={(el) => { sectionRefs.current['debug'] = el; }} className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
                    调试模式
                  </h2>
                  <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                    {debugMode ? '调试输出会随对话内容一同显示' : '关闭后对话界面更简洁'}
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
            <section ref={(el) => { sectionRefs.current['developer'] = el; }}>
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
                {isDebugExpanded ?
                  <ChevronUp className="h-3.5 w-3.5" />
                : <ChevronDown className="h-3.5 w-3.5" />}
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
                        <span className="text-[11px] text-green-600 dark:text-green-400">
                          已保存
                        </span>
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
                    {isLoadingDiagnosticMetadata ?
                      <p className="text-xs text-neutral-500">加载中...</p>
                    : diagnosticMetadata ?
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          ['版本', diagnosticMetadata.appVersion],
                          ['Electron', diagnosticMetadata.electronVersion],
                          ['Chromium', diagnosticMetadata.chromiumVersion],
                          ['Node.js', diagnosticMetadata.nodeVersion],
                          ['V8', diagnosticMetadata.v8Version],
                          ['平台', `${diagnosticMetadata.platform} (${diagnosticMetadata.arch})`],
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
                    : <p className="text-xs text-neutral-500">加载失败</p>}
                  </div>

                  <div className="border-t border-neutral-200 dark:border-neutral-700" />

                  {/* PATH */}
                  <div className="space-y-2">
                    <p className="text-[10px] font-semibold tracking-widest text-neutral-400 uppercase dark:text-neutral-500">
                      PATH
                    </p>
                    {isLoadingPathInfo ?
                      <p className="text-xs text-neutral-500">加载中...</p>
                    : pathInfo ?
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
                    : <p className="text-xs text-neutral-500">加载失败</p>}
                  </div>

                  <div className="border-t border-neutral-200 dark:border-neutral-700" />

                  {/* Environment Variables */}
                  <div className="space-y-2">
                    <p className="text-[10px] font-semibold tracking-widest text-neutral-400 uppercase dark:text-neutral-500">
                      环境变量
                    </p>
                    {isLoadingEnvVars ?
                      <p className="text-xs text-neutral-500">加载中...</p>
                    : envVars ?
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
                    : <p className="text-xs text-neutral-500">加载失败</p>}
                  </div>
                </div>
              )}
            </section>
            </div>
          }
        </div>
      </div>
    </div>
  );
}

export default Settings;
