import { ExternalLink, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createHighlighterCore, type HighlighterCore } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';

import Markdown from '@/components/Markdown';

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

const EXT_TO_SHIKI_LANG: Record<string, string> = {
  js: 'javascript',
  jsx: 'jsx',
  ts: 'typescript',
  tsx: 'tsx',
  py: 'python',
  rb: 'ruby',
  go: 'go',
  rs: 'rust',
  java: 'java',
  c: 'c',
  cpp: 'cpp',
  h: 'c',
  hpp: 'cpp',
  sh: 'bash',
  bash: 'bash',
  css: 'css',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  xml: 'xml',
  sql: 'sql',
  graphql: 'graphql',
  vue: 'vue',
  svelte: 'svelte',
  svg: 'xml',
  html: 'html',
  htm: 'html'
};

let highlighterPromise: Promise<HighlighterCore> | null = null;

function getHighlighter(): Promise<HighlighterCore> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighterCore({
      themes: [import('@shikijs/themes/github-dark')],
      langs: [
        import('@shikijs/langs/javascript'),
        import('@shikijs/langs/jsx'),
        import('@shikijs/langs/typescript'),
        import('@shikijs/langs/tsx'),
        import('@shikijs/langs/python'),
        import('@shikijs/langs/ruby'),
        import('@shikijs/langs/go'),
        import('@shikijs/langs/rust'),
        import('@shikijs/langs/java'),
        import('@shikijs/langs/c'),
        import('@shikijs/langs/cpp'),
        import('@shikijs/langs/bash'),
        import('@shikijs/langs/css'),
        import('@shikijs/langs/json'),
        import('@shikijs/langs/yaml'),
        import('@shikijs/langs/toml'),
        import('@shikijs/langs/xml'),
        import('@shikijs/langs/sql'),
        import('@shikijs/langs/graphql'),
        import('@shikijs/langs/vue'),
        import('@shikijs/langs/svelte'),
        import('@shikijs/langs/html')
      ],
      engine: createJavaScriptRegexEngine()
    }).catch((err) => {
      highlighterPromise = null;
      throw err;
    });
  }
  return highlighterPromise;
}

function getShikiLang(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  return EXT_TO_SHIKI_LANG[ext] || 'text';
}

function CodePreview({ content, fileName }: { content: string; fileName: string }) {
  const [highlightedHtml, setHighlightedHtml] = useState<string | null>(null);
  const lang = getShikiLang(fileName);

  useEffect(() => {
    let cancelled = false;
    getHighlighter()
      .then((highlighter) => {
        if (cancelled) return;
        const supported = highlighter.getLoadedLanguages();
        const html = highlighter.codeToHtml(content, {
          lang: supported.includes(lang) ? lang : 'text',
          theme: 'github-dark'
        });
        setHighlightedHtml(html);
      })
      .catch(() => {
        if (!cancelled) setHighlightedHtml(null);
      });
    return () => {
      cancelled = true;
    };
  }, [content, lang]);

  if (highlightedHtml) {
    return (
      <div
        className="h-full overflow-auto p-4 text-sm [&_pre]:!bg-transparent"
        dangerouslySetInnerHTML={{ __html: highlightedHtml }}
      />
    );
  }

  // Fallback to plain text while loading
  return (
    <pre className="h-full overflow-auto p-4 text-sm text-neutral-300">
      <code>{content}</code>
    </pre>
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
            error: response.error || 'Failed to read file'
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
    <div className="flex h-full flex-col border-l" style={{ borderColor: 'var(--color-sidebar-border)', background: 'var(--color-content-bg)' }}>
      {/* Header */}
      <div className="flex items-center justify-between border-b px-3 py-2" style={{ borderColor: 'var(--color-sidebar-border)' }}>
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
      <div className="flex-1 overflow-hidden" style={{ background: 'var(--color-content-secondary)' }}>
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
