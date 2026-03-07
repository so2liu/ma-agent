import {
  ChevronDown,
  ChevronRight,
  File,
  FileCode,
  FileImage,
  FileJson,
  FileText,
  Folder,
  RefreshCw,
  Trash2
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { FileTreeNode } from '@/electron';

import {
  CODE_EXTENSIONS,
  getFileExtension,
  IMAGE_EXTENSIONS,
  PREVIEWABLE_EXTENSIONS
} from '../../shared/file-extensions';

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
  if (ext === 'json') {
    return <FileJson className="h-3.5 w-3.5 shrink-0 text-yellow-500" />;
  }
  if (ext === 'md' || ext === 'txt') {
    return <FileText className="h-3.5 w-3.5 shrink-0 text-blue-400" />;
  }
  if (CODE_EXTENSIONS.has(ext)) {
    return <FileCode className="h-3.5 w-3.5 shrink-0 text-violet-400" />;
  }
  return <File className="h-3.5 w-3.5 shrink-0 text-neutral-400 dark:text-neutral-500" />;
}

interface DeleteConfirmProps {
  name: string;
  isDirectory: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function DeleteConfirm({ name, isDirectory, onConfirm, onCancel }: DeleteConfirmProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onCancel();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onCancel]);

  return (
    <div
      ref={ref}
      className="mx-1 my-0.5 rounded-md border border-red-300/50 bg-red-50 p-2 dark:border-red-800/50 dark:bg-red-950/30"
    >
      <p className="mb-1.5 text-[10px] text-red-700 dark:text-red-300">
        Delete {isDirectory ? 'folder' : 'file'} &quot;{name}&quot;?
        {isDirectory && ' All contents will be removed.'}
      </p>
      <div className="flex gap-1">
        <button
          onClick={onConfirm}
          className="rounded bg-red-500 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700"
        >
          Delete
        </button>
        <button
          onClick={onCancel}
          className="rounded bg-neutral-200 px-2 py-0.5 text-[10px] font-medium text-neutral-600 hover:bg-neutral-300 dark:bg-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-600"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

interface TreeNodeProps {
  node: FileTreeNode;
  depth: number;
  onFileSelect: (path: string) => void;
  selectedPath: string | null;
  onDelete: (path: string, isDirectory: boolean) => Promise<void>;
}

function TreeNode({ node, depth, onFileSelect, selectedPath, onDelete }: TreeNodeProps) {
  const [isOpen, setIsOpen] = useState(depth < 1);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const handleDelete = async () => {
    setShowDeleteConfirm(false);
    await onDelete(node.path, node.type === 'directory');
  };

  if (node.type === 'directory') {
    return (
      <div>
        <div
          className="group relative"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
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
          {isHovered && !showDeleteConfirm && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowDeleteConfirm(true);
              }}
              className="absolute top-0.5 right-1 rounded p-0.5 text-neutral-400 hover:bg-red-100 hover:text-red-500 dark:text-neutral-500 dark:hover:bg-red-900/30 dark:hover:text-red-400"
              title={`Delete ${node.name}`}
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
        {showDeleteConfirm && (
          <DeleteConfirm
            name={node.name}
            isDirectory
            onConfirm={handleDelete}
            onCancel={() => setShowDeleteConfirm(false)}
          />
        )}
        {isOpen && node.children && (
          <div>
            {node.children.map((child) => (
              <TreeNode
                key={child.path}
                node={child}
                depth={depth + 1}
                onFileSelect={onFileSelect}
                selectedPath={selectedPath}
                onDelete={onDelete}
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
    <div
      className="group relative"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <button
        onClick={() => previewable && onFileSelect(node.path)}
        className={`flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-xs ${
          isSelected ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
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
      {isHovered && !showDeleteConfirm && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowDeleteConfirm(true);
          }}
          className="absolute top-0.5 right-1 rounded p-0.5 text-neutral-400 hover:bg-red-100 hover:text-red-500 dark:text-neutral-500 dark:hover:bg-red-900/30 dark:hover:text-red-400"
          title={`Delete ${node.name}`}
        >
          <Trash2 className="h-3 w-3" />
        </button>
      )}
      {showDeleteConfirm && (
        <DeleteConfirm
          name={node.name}
          isDirectory={false}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </div>
  );
}

interface FileTreeProps {
  onFileSelect: (path: string) => void;
  selectedPath: string | null;
  onFileDeleted?: (path: string, isDirectory: boolean) => void;
}

export default function FileTree({ onFileSelect, selectedPath, onFileDeleted }: FileTreeProps) {
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

  const handleDelete = useCallback(
    async (path: string, isDirectory: boolean) => {
      try {
        const response = await window.electron.workspace.deleteFile(path, isDirectory);
        if (response.success) {
          await loadFiles();
          onFileDeleted?.(path, isDirectory);
        } else {
          console.error('Error deleting file:', response.error);
        }
      } catch (error) {
        console.error('Error deleting file:', error);
      }
    },
    [loadFiles, onFileDeleted]
  );

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
              onDelete={handleDelete}
            />
          ))
        }
      </div>
    </div>
  );
}
