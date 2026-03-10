import { ExternalLink, FileImage, FileText, Globe } from 'lucide-react';

import type { ArtifactType } from '../../shared/file-extensions';

export interface Deliverable {
  id: string;
  filePath: string;
  fileName: string;
  type: ArtifactType;
  content?: string;
}

interface DeliverableCardProps {
  deliverable: Deliverable;
  onPreview?: (deliverable: Deliverable) => void;
}

const TYPE_CONFIG: Record<string, { icon: typeof Globe; label: string }> = {
  html: { icon: Globe, label: '网页' },
  image: { icon: FileImage, label: '图片' },
  markdown: { icon: FileText, label: '文档' },
  text: { icon: FileText, label: '文本' }
};

export default function DeliverableCard({ deliverable, onPreview }: DeliverableCardProps) {
  const config = TYPE_CONFIG[deliverable.type];
  if (!config) return null;

  const Icon = config.icon;

  return (
    <button
      type="button"
      onClick={() => onPreview?.(deliverable)}
      className="group flex w-fit max-w-sm items-center gap-2.5 rounded-xl border border-neutral-200/80 bg-gradient-to-r from-neutral-50 to-white px-3.5 py-2.5 text-left shadow-sm transition-all hover:border-neutral-300 hover:shadow-md dark:border-neutral-700/60 dark:from-neutral-800/60 dark:to-neutral-800/40 dark:hover:border-neutral-600"
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-300">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-neutral-800 dark:text-neutral-200">
          {deliverable.fileName}
        </p>
        <p className="text-[11px] text-neutral-400 dark:text-neutral-500">
          {config.label} -- 点击预览
        </p>
      </div>
      <ExternalLink className="h-3.5 w-3.5 shrink-0 text-neutral-300 transition-colors group-hover:text-neutral-500 dark:text-neutral-600 dark:group-hover:text-neutral-400" />
    </button>
  );
}
