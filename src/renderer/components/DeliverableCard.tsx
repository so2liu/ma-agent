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
        'w-fit max-w-sm border-border bg-card shadow-sm transition-colors',
        onPreview && 'cursor-pointer hover:bg-accent/40'
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
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <ArtifactTitle className="truncate text-sm text-foreground">
              {deliverable.fileName}
            </ArtifactTitle>
            <ArtifactDescription className="text-[11px] text-muted-foreground/70">
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
