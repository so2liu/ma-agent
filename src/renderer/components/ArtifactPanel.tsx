import { ExternalLink, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

export interface Artifact {
  id: string;
  filePath: string;
  fileName: string;
  type: 'html' | 'image';
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
          setDiskResult({ path: targetPath, content: response.content, dataUrl: null, error: null });
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
    <div className="flex h-full flex-col border-l border-neutral-200/70 bg-white dark:border-neutral-800 dark:bg-neutral-900">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-neutral-200/70 px-3 py-2 dark:border-neutral-800">
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
            title="Open in browser"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onClose}
            className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
            title="Close preview"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {display.loading && (
          <div className="flex h-full items-center justify-center text-xs text-neutral-400">
            Loading...
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
      </div>
    </div>
  );
}
