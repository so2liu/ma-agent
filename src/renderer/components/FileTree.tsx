import { ChevronDown, ChevronRight, File, FileImage, FileText, Folder, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import type { FileTreeNode } from '@/electron';

const PREVIEWABLE_EXTENSIONS = new Set([
  'html',
  'htm',
  'svg',
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'bmp',
  'avif'
]);

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif', 'ico']);

function getFileExtension(name: string): string {
  return name.split('.').pop()?.toLowerCase() || '';
}

function isPreviewable(name: string): boolean {
  return PREVIEWABLE_EXTENSIONS.has(getFileExtension(name));
}

function FileIcon({ name }: { name: string }) {
  const ext = getFileExtension(name);
  if (IMAGE_EXTENSIONS.has(ext)) {
    return <FileImage className="h-3.5 w-3.5 shrink-0 text-green-500" />;
  }
  if (ext === 'html' || ext === 'htm' || ext === 'svg') {
    return <FileText className="h-3.5 w-3.5 shrink-0 text-orange-500" />;
  }
  return <File className="h-3.5 w-3.5 shrink-0 text-neutral-400 dark:text-neutral-500" />;
}

interface TreeNodeProps {
  node: FileTreeNode;
  depth: number;
  onFileSelect: (path: string) => void;
  selectedPath: string | null;
}

function TreeNode({ node, depth, onFileSelect, selectedPath }: TreeNodeProps) {
  const [isOpen, setIsOpen] = useState(depth < 1);

  if (node.type === 'directory') {
    return (
      <div>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-xs text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
          style={{ paddingLeft: depth * 12 + 4 }}
        >
          {isOpen ?
            <ChevronDown className="h-3 w-3 shrink-0 text-neutral-400" />
          : <ChevronRight className="h-3 w-3 shrink-0 text-neutral-400" />}
          <Folder className="h-3.5 w-3.5 shrink-0 text-blue-500" />
          <span className="truncate">{node.name}</span>
        </button>
        {isOpen && node.children && (
          <div>
            {node.children.map((child) => (
              <TreeNode
                key={child.path}
                node={child}
                depth={depth + 1}
                onFileSelect={onFileSelect}
                selectedPath={selectedPath}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  const previewable = isPreviewable(node.name);
  const isSelected = selectedPath === node.path;

  return (
    <button
      onClick={() => previewable && onFileSelect(node.path)}
      className={`flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-xs ${
        isSelected ?
          'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
        : previewable ?
          'cursor-pointer text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800'
        : 'cursor-default text-neutral-400 dark:text-neutral-500'
      }`}
      style={{ paddingLeft: depth * 12 + 4 + 16 }}
      disabled={!previewable}
      title={previewable ? node.path : `${node.path} (not previewable)`}
    >
      <FileIcon name={node.name} />
      <span className="truncate">{node.name}</span>
    </button>
  );
}

interface FileTreeProps {
  onFileSelect: (path: string) => void;
  selectedPath: string | null;
}

export default function FileTree({ onFileSelect, selectedPath }: FileTreeProps) {
  const [files, setFiles] = useState<FileTreeNode[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadFiles = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await window.electron.workspace.listFiles();
      if (response.success) {
        setFiles(response.files);
      }
    } catch (error) {
      console.error('Error loading file tree:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-3 py-1.5">
        <span className="text-[10px] font-semibold tracking-wider text-neutral-400 uppercase dark:text-neutral-500">
          Files
        </span>
        <button
          onClick={loadFiles}
          disabled={isLoading}
          className="rounded p-0.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
          title="Refresh file tree"
        >
          <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-1 pb-2">
        {files.length === 0 ?
          <div className="px-3 py-4 text-center text-xs text-neutral-400 dark:text-neutral-500">
            {isLoading ? 'Loading...' : 'No files'}
          </div>
        : files.map((node) => (
            <TreeNode
              key={node.path}
              node={node}
              depth={0}
              onFileSelect={onFileSelect}
              selectedPath={selectedPath}
            />
          ))
        }
      </div>
    </div>
  );
}
