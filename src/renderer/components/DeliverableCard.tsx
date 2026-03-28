import { ExternalLink, FileImage, FileText, Globe } from 'lucide-react';

import {
  Artifact,
  ArtifactAction,
  ArtifactActions,
  ArtifactDescription,
  ArtifactHeader,
  ArtifactTitle
} from '@/components/ai-elements/artifact';
import { cn } from '@/lib/utils';

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
  const handlePreview = () => onPreview?.(deliverable);

  return (
    <Artifact
      className={cn(
        'w-fit max-w-sm border-neutral-200/80 bg-gradient-to-r from-neutral-50 to-white shadow-sm transition-all dark:border-neutral-700/60 dark:from-neutral-800/60 dark:to-neutral-800/40',
        onPreview && 'cursor-pointer hover:border-neutral-300 hover:shadow-md dark:hover:border-neutral-600'
      )}
      onClick={handlePreview}
      onKeyDown={
        onPreview ?
          (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              handlePreview();
            }
          }
        : undefined
      }
      role={onPreview ? 'button' : undefined}
      tabIndex={onPreview ? 0 : undefined}
    >
      <ArtifactHeader className="gap-3 border-b-0 bg-transparent px-3.5 py-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-300">
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <ArtifactTitle className="truncate text-sm text-neutral-800 dark:text-neutral-200">
              {deliverable.fileName}
            </ArtifactTitle>
            <ArtifactDescription className="text-[11px] text-neutral-400 dark:text-neutral-500">
              {config.label} · 点击预览
            </ArtifactDescription>
          </div>
        </div>
        <ArtifactActions className="shrink-0">
          <ArtifactAction
            icon={ExternalLink}
            label="预览"
            tooltip="预览"
            onClick={(event) => {
              event.stopPropagation();
              handlePreview();
            }}
          />
        </ArtifactActions>
      </ArtifactHeader>
    </Artifact>
  );
}
