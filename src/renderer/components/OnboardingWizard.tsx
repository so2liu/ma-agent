import { ArrowRight, CheckCircle2, Key, Loader2, X } from 'lucide-react';
import { useState } from 'react';

interface OnboardingWizardProps {
  onComplete: (apiKeySaved: boolean) => void;
  mode?: 'fullscreen' | 'dialog';
}

type Step = 'welcome' | 'apikey' | 'done';

function OnboardingContent({ onComplete }: { onComplete: (apiKeySaved: boolean) => void }) {
  const [step, setStep] = useState<Step>('welcome');
  const [apiKey, setApiKey] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSaveApiKey = async () => {
    if (!apiKey.trim()) return;
    setIsSaving(true);
    setError(null);
    try {
      const response = await window.electron.config.setApiKey(apiKey.trim());
      if (response.success) {
        setStep('done');
      } else {
        setError('保存失败，请重试');
      }
    } catch {
      setError('保存失败，请检查网络后重试');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      {step === 'welcome' && (
        <div className="text-center">
          <div className="mb-6 text-5xl">&#x1F434;</div>
          <h1 className="mb-2 text-2xl font-bold text-neutral-900 dark:text-white">
            欢迎使用小马快跑
          </h1>
          <p className="mb-2 text-sm leading-relaxed text-neutral-500 dark:text-neutral-400">
            你的 AI 工作助手，能帮你分析数据、处理文档、撰写文案等。
          </p>
          <p className="mb-8 text-xs text-neutral-400 dark:text-neutral-500">
            设置 API 密钥后即可开始
          </p>
          <button
            onClick={() => setStep('apikey')}
            className="inline-flex items-center gap-2 rounded-xl bg-neutral-900 px-6 py-3 text-sm font-medium text-white shadow-lg transition hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100"
          >
            开始设置
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {step === 'apikey' && (
        <div>
          <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-neutral-100 dark:bg-neutral-800">
            <Key className="h-6 w-6 text-neutral-600 dark:text-neutral-300" />
          </div>
          <h2 className="mb-2 text-xl font-bold text-neutral-900 dark:text-white">输入 API 密钥</h2>
          <p className="mb-6 text-sm leading-relaxed text-neutral-500 dark:text-neutral-400">
            请输入你的 Anthropic API 密钥。
            <br />
            密钥以{' '}
            <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs dark:bg-neutral-800">
              sk-ant-
            </code>{' '}
            开头，可在{' '}
            <button
              type="button"
              onClick={() =>
                window.electron.shell.openExternal('https://console.anthropic.com/settings/keys')
              }
              className="text-neutral-700 underline dark:text-neutral-300"
            >
              Anthropic 控制台
            </button>{' '}
            获取。
          </p>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSaveApiKey()}
            placeholder="sk-ant-..."
            className="mb-3 w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 placeholder-neutral-400 outline-none focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white dark:placeholder-neutral-500 dark:focus:border-neutral-500 dark:focus:ring-neutral-700"
            autoFocus
          />
          {error && <p className="mb-3 text-xs text-red-500">{error}</p>}
          <button
            onClick={handleSaveApiKey}
            disabled={!apiKey.trim() || isSaving}
            className="w-full rounded-xl bg-neutral-900 px-6 py-3 text-sm font-medium text-white shadow-lg transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100"
          >
            {isSaving ?
              <Loader2 className="mx-auto h-4 w-4 animate-spin" />
            : '保存并继续'}
          </button>
          <button
            onClick={() => onComplete(false)}
            className="mt-3 w-full text-xs text-neutral-400 transition hover:text-neutral-600 dark:hover:text-neutral-300"
          >
            稍后设置
          </button>
        </div>
      )}

      {step === 'done' && (
        <div className="text-center">
          <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-green-500" />
          <h2 className="mb-2 text-xl font-bold text-neutral-900 dark:text-white">设置完成</h2>
          <p className="mb-6 text-sm text-neutral-500 dark:text-neutral-400">
            一切就绪，开始体验吧
          </p>
          <button
            onClick={() => onComplete(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-neutral-900 px-6 py-3 text-sm font-medium text-white shadow-lg transition hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100"
          >
            开始使用
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </>
  );
}

export default function OnboardingWizard({
  onComplete,
  mode = 'fullscreen'
}: OnboardingWizardProps) {
  if (mode === 'dialog') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div
          className="fixed inset-0 bg-black/50"
          role="presentation"
          onClick={() => onComplete(false)}
        />
        <div className="relative z-50 w-full max-w-md rounded-xl border border-neutral-200 bg-white p-8 shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
          <button
            onClick={() => onComplete(false)}
            className="absolute top-4 right-4 rounded-lg p-1 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
          >
            <X className="h-4 w-4" />
          </button>
          <OnboardingContent onComplete={onComplete} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen items-center justify-center bg-gradient-to-br from-neutral-50 to-neutral-100 dark:from-neutral-950 dark:to-neutral-900">
      <div className="w-full max-w-md px-6">
        <OnboardingContent onComplete={onComplete} />
      </div>
    </div>
  );
}
