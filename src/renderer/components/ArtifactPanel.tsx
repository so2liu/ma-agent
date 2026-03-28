import { ExternalLink, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { CodeBlock, CodeBlockCopyButton } from '@/components/ai-elements/code-block';
import Markdown from '@/components/Markdown';
import { detectLanguage } from '@/lib/ai-elements-adapters';

import type { ArtifactType } from '../../shared/file-extensions';

export type { ArtifactType };

export interface Artifact {
  id: string;
  filePath: string;
  fileName: string;
  type: ArtifactType;
  // For HTML artifacts extracted from Write tool, content is available directly
  content?: string;
}

interface ArtifactPanelProps {
  artifact: Artifact | null;
  onClose: () => void;
}

interface DiskLoadResult {
  path: string;
  content: string | null;
  dataUrl: string | null;
  error: string | null;
}

function CodePreview({ content, fileName }: { content: string; fileName: string }) {
  const language = detectLanguage(fileName);

  return (
    <div className="h-full overflow-auto p-4">
      <CodeBlock code={content} language={language} showLineNumbers>
        <CodeBlockCopyButton />
      </CodeBlock>
    </div>
  );
}

function MarkdownPreview({ content }: { content: string }) {
  return (
    <div className="h-full overflow-auto p-4">
      <div className="prose prose-sm max-w-none prose-neutral dark:prose-invert">
        <Markdown>{content}</Markdown>
      </div>
    </div>
  );
}

function TextPreview({ content }: { content: string }) {
  return (
    <pre className="h-full overflow-auto p-4 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
      {content}
    </pre>
  );
}

export default function ArtifactPanel({ artifact, onClose }: ArtifactPanelProps) {
  // Only stores the completed result of disk reads
  const [diskResult, setDiskResult] = useState<DiskLoadResult | null>(null);
  const loadingPathRef = useRef<string | null>(null);

  // Load file from disk only when needed (no inline content)
  useEffect(() => {
    if (!artifact || artifact.content) {
      loadingPathRef.current = null;
      return;
    }

    const targetPath = artifact.filePath;

    // Skip if already loaded
    if (diskResult?.path === targetPath) return;

    loadingPathRef.current = targetPath;
    let cancelled = false;

    window.electron.workspace
      .readFile(targetPath)
      .then((response) => {
        if (cancelled) return;
        if (!response.success || !response.content) {
          setDiskResult({
            path: targetPath,
            content: null,
            dataUrl: null,
            error: response.error || '读取文件失败'
          });
          return;
        }
        if (response.isText) {
          setDiskResult({
            path: targetPath,
            content: response.content,
            dataUrl: null,
            error: null
          });
        } else {
          setDiskResult({
            path: targetPath,
            content: null,
            dataUrl: `data:${response.mimeType};base64,${response.content}`,
            error: null
          });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setDiskResult({ path: targetPath, content: null, dataUrl: null, error: String(err) });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [artifact, diskResult?.path]);

  // Derive display state without any setState
  const display = useMemo(() => {
    if (!artifact) return { content: null, dataUrl: null, error: null, loading: false };

    // Inline content (from Write tool) - no disk load needed
    if (artifact.content) {
      return { content: artifact.content, dataUrl: null, error: null, loading: false };
    }

    // Check if disk result matches current artifact
    if (diskResult && diskResult.path === artifact.filePath) {
      return {
        content: diskResult.content,
        dataUrl: diskResult.dataUrl,
        error: diskResult.error,
        loading: false
      };
    }

    // Waiting for disk load
    return { content: null, dataUrl: null, error: null, loading: true };
  }, [artifact, diskResult]);

  if (!artifact) return null;

  const handleOpenExternal = () => {
    window.electron.workspace.openFile(artifact.filePath);
  };

  return (
    <div
      className="flex h-full flex-col border-l"
      style={{ borderColor: 'var(--color-sidebar-border)', background: 'var(--color-content-bg)' }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between border-b px-3 py-2"
        style={{ borderColor: 'var(--color-sidebar-border)' }}
      >
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-xs font-medium text-neutral-700 dark:text-neutral-300">
            {artifact.fileName}
          </h3>
          <p className="truncate text-[10px] text-neutral-400 dark:text-neutral-500">
            {artifact.filePath}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleOpenExternal}
            className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
            title="在浏览器中打开"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onClose}
            className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
            title="关闭预览"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div
        className="flex-1 overflow-hidden"
        style={{ background: 'var(--color-content-secondary)' }}
      >
        {display.loading && (
          <div className="flex h-full items-center justify-center text-xs text-neutral-400">
            加载中...
          </div>
        )}

        {display.error && (
          <div className="flex h-full items-center justify-center px-4 text-center text-xs text-red-500">
            {display.error}
          </div>
        )}

        {!display.loading && !display.error && artifact.type === 'html' && display.content && (
          <iframe
            srcDoc={display.content}
            className="h-full w-full border-0 bg-white"
            sandbox="allow-scripts allow-same-origin"
            title={artifact.fileName}
          />
        )}

        {!display.loading && !display.error && artifact.type === 'image' && (
          <div className="flex h-full items-center justify-center overflow-auto p-4">
            <img
              src={display.dataUrl || undefined}
              alt={artifact.fileName}
              className="max-h-full max-w-full object-contain"
            />
          </div>
        )}

        {!display.loading && !display.error && artifact.type === 'markdown' && display.content && (
          <MarkdownPreview content={display.content} />
        )}

        {!display.loading && !display.error && artifact.type === 'code' && display.content && (
          <CodePreview content={display.content} fileName={artifact.fileName} />
        )}

        {!display.loading && !display.error && artifact.type === 'text' && display.content && (
          <TextPreview content={display.content} />
        )}
      </div>
    </div>
  );
}
