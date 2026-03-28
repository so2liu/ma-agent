import { Paperclip } from 'lucide-react';
import { useMemo, useState } from 'react';

import {
  Attachment,
  AttachmentInfo,
  AttachmentPreview,
  AttachmentRemove,
  Attachments
} from '@/components/ai-elements/attachments';
import { mapAttachment } from '@/lib/ai-elements-adapters';
import type { MessageAttachment } from '@/types/chat';
import { formatFileSize } from '@/utils/formatFileSize';

export interface AttachmentPreviewItem {
  id: string;
  name: string;
  size: number;
  isImage?: boolean;
  mimeType?: string;
  previewUrl?: string;
  savedPath?: string;
  relativePath?: string;
  footnoteLines?: string[];
}

interface AttachmentPreviewListProps {
  attachments: AttachmentPreviewItem[];
  onRemove?: (id: string) => void;
  className?: string;
  cardClassName?: string;
  imageDimensions?: string;
}

export default function AttachmentPreviewList({
  attachments,
  onRemove,
  className = '',
  cardClassName = '',
  imageDimensions = 'h-28 w-28'
}: AttachmentPreviewListProps) {
  const [previewErrorIds, setPreviewErrorIds] = useState<string[]>([]);
  const previewErrorIdSet = useMemo(() => {
    const validIds = new Set(attachments.map((attachment) => attachment.id));
    return new Set(previewErrorIds.filter((id) => validIds.has(id)));
  }, [attachments, previewErrorIds]);

  const mappedAttachments = useMemo(
    () =>
      attachments.map((attachment) => {
        const normalizedAttachment: MessageAttachment = {
          id: attachment.id,
          name: attachment.name,
          size: attachment.size,
          mimeType:
            attachment.mimeType ??
            (attachment.isImage ? 'image/*' : 'application/octet-stream'),
          previewUrl: attachment.previewUrl,
          savedPath: attachment.savedPath,
          relativePath: attachment.relativePath,
          isImage: attachment.isImage
        };
        const mapped = mapAttachment(normalizedAttachment);

        return {
          original: attachment,
          mapped:
            previewErrorIdSet.has(attachment.id) ?
              { ...mapped, url: '' }
            : mapped
        };
      }),
    [attachments, previewErrorIdSet]
  );

  const markPreviewError = (attachmentId: string) => {
    setPreviewErrorIds((prev) => (prev.includes(attachmentId) ? prev : [...prev, attachmentId]));
  };

  const handleRemove = (attachmentId: string) => {
    setPreviewErrorIds((prev) => prev.filter((id) => id !== attachmentId));
    onRemove?.(attachmentId);
  };

  if (attachments.length === 0) {
    return null;
  }

  return (
    <Attachments variant="list" className={className}>
      {mappedAttachments.map(({ original: attachment, mapped }) => {
        const footnoteLines =
          attachment.footnoteLines ?? [attachment.relativePath ?? attachment.savedPath].filter(Boolean);
        const showImagePreview = mapped.mediaType.startsWith('image/') && Boolean(mapped.url);

        return (
          <Attachment
            key={attachment.id}
            data={mapped}
            onRemove={onRemove ? () => handleRemove(attachment.id) : undefined}
            className={`min-w-[14rem] rounded-2xl border-border bg-card shadow-sm ${cardClassName}`}
          >
            {showImagePreview ?
              <div className={`overflow-hidden rounded-xl ${imageDimensions}`}>
                <img
                  src={mapped.url}
                  alt={attachment.name}
                  className="h-full w-full object-cover"
                  onError={() => markPreviewError(attachment.id)}
                  loading="lazy"
                />
              </div>
            : <AttachmentPreview
                fallbackIcon={<Paperclip className="h-4 w-4 text-muted-foreground" />}
                className="bg-muted"
              />
            }
            <div className="min-w-0 flex-1">
              <AttachmentInfo className="text-xs font-medium text-foreground" />
              <p className="text-[11px] text-muted-foreground">
                {formatFileSize(attachment.size)}
              </p>
              {footnoteLines.map((line, index) => (
                <p
                  key={`${attachment.id}-footnote-${index}`}
                  className="truncate text-[11px] text-muted-foreground"
                >
                  {line}
                </p>
              ))}
            </div>
            {onRemove && (
              <AttachmentRemove
                label={`删除 ${attachment.name}`}
                className="text-muted-foreground hover:text-foreground"
              />
            )}
          </Attachment>
        );
      })}
    </Attachments>
  );
}
