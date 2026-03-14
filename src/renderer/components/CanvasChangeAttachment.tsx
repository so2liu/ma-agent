/**
 * Shows canvas changes as a compact attachment chip in the chat input area.
 * Supports multiple files' changes simultaneously.
 */

import { Pencil, X } from 'lucide-react';

import type { FileChangesMap } from '@/hooks/useCanvasChanges';

interface CanvasChangeAttachmentProps {
  changesByFile: FileChangesMap;
  onDismiss: () => void;
}

export default function CanvasChangeAttachment({
  changesByFile,
  onDismiss
}: CanvasChangeAttachmentProps) {
  let totalAdded = 0;
  let totalModified = 0;
  let totalDeleted = 0;
  const fileNames: string[] = [];

  for (const [fp, changes] of changesByFile) {
    fileNames.push(fp.split('/').pop() ?? fp);
    for (const c of changes) {
      if (c.type === 'added') totalAdded++;
      else if (c.type === 'modified') totalModified++;
      else if (c.type === 'deleted') totalDeleted++;
    }
  }

  const parts: string[] = [];
  if (totalAdded > 0) parts.push(`${totalAdded} 个新增`);
  if (totalModified > 0) parts.push(`${totalModified} 个修改`);
  if (totalDeleted > 0) parts.push(`${totalDeleted} 个删除`);

  const label =
    fileNames.length === 1 ? `画布变更: ${fileNames[0]}` : `画布变更: ${fileNames.length} 个文件`;

  return (
    <div className="relative inline-flex items-center gap-2 rounded-xl border border-neutral-200/80 bg-neutral-50 px-3 py-2 dark:border-neutral-700/60 dark:bg-neutral-800/40">
      <div className="rounded-full bg-blue-100 p-1.5 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400">
        <Pencil className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-neutral-900 dark:text-neutral-100">
          {label}
        </p>
        <p className="text-[11px] text-neutral-500 dark:text-neutral-400">{parts.join(', ')}</p>
      </div>
      <button
        type="button"
        aria-label="忽略画布变更"
        onClick={onDismiss}
        className="rounded-full p-0.5 text-neutral-400 transition hover:bg-neutral-200 hover:text-neutral-600 dark:hover:bg-neutral-700 dark:hover:text-neutral-300"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
