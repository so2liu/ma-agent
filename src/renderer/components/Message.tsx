import { forwardRef } from 'react';
import { Copy, RefreshCw, Settings } from 'lucide-react';

import AttachmentPreviewList from '@/components/AttachmentPreviewList';
import BlockGroup from '@/components/BlockGroup';
import DeliverableCard from '@/components/DeliverableCard';
import type { Deliverable } from '@/components/DeliverableCard';
import Markdown from '@/components/Markdown';
import MessageFeedbackComponent from '@/components/MessageFeedback';
import type { ContentBlock, Message as MessageType, WriteInput } from '@/types/chat';

import { getArtifactType, getFileExtension } from '../../shared/file-extensions';

interface MessageProps {
  message: MessageType;
  isLoading?: boolean;
  onDeliverablePreview?: (deliverable: Deliverable) => void;
  conversationId?: string | null;
  onRetryMessage?: () => void;
  onOpenSettings?: () => void;
}

function extractDeliverables(blocks: ContentBlock[]): Deliverable[] {
  const deliverables: Deliverable[] = [];
  for (const block of blocks) {
    if (block.type !== 'tool_use' || !block.tool) continue;
    if (block.tool.name !== 'Write' || block.tool.isError || !block.tool.result) continue;

    const input = block.tool.parsedInput as WriteInput | undefined;
    if (!input?.file_path) continue;

    const ext = getFileExtension(input.file_path);
    const type = getArtifactType(ext);
    // Only show cards for user-facing file types (not code)
    if (!type || type === 'code') continue;

    deliverables.push({
      id: block.tool.id,
      filePath: input.file_path,
      fileName: input.file_path.split('/').pop() || input.file_path,
      type,
      content: type === 'html' ? input.content : undefined
    });
  }
  return deliverables;
}

const Message = forwardRef<HTMLDivElement, MessageProps>(function Message(
  {
    message,
    isLoading = false,
    onDeliverablePreview,
    conversationId,
    onRetryMessage,
    onOpenSettings
  },
  ref
) {
  if (message.role === 'user') {
    const userContent = typeof message.content === 'string' ? message.content : '';
    const hasText = userContent.trim().length > 0;
    const hasAttachments = Boolean(message.attachments?.length);
    const attachmentItems =
      message.attachments?.map((attachment) => ({
        id: attachment.id,
        name: attachment.name,
        size: attachment.size,
        isImage: attachment.isImage ?? attachment.mimeType.startsWith('image/'),
        previewUrl: attachment.previewUrl,
        footnoteLines: [attachment.relativePath ?? attachment.savedPath].filter(
          (line): line is string => Boolean(line)
        )
      })) ?? [];

    return (
      <div ref={ref} className="flex justify-end px-1">
        <article className="relative max-w-[min(34rem,calc(100%-2rem))] rounded-2xl border border-neutral-200/70 bg-white px-3 py-2 text-base leading-relaxed text-neutral-900 shadow-sm shadow-black/5 dark:border-neutral-800/60 dark:bg-neutral-900/70 dark:text-neutral-50 dark:shadow-black/30">
          {hasText && (
            <div className="prose prose-base max-w-none prose-neutral dark:prose-invert">
              <Markdown>{userContent}</Markdown>
            </div>
          )}
          {hasAttachments && (
            <div className={hasText ? 'mt-2' : ''}>
              <AttachmentPreviewList attachments={attachmentItems} />
            </div>
          )}
        </article>
      </div>
    );
  }

  // Assistant message
  if (typeof message.content === 'string') {
    return (
      <div ref={ref} className="flex justify-start">
        <article className="w-full px-3 py-2">
          <div className="prose prose-base max-w-none text-base leading-relaxed prose-neutral dark:prose-invert">
            <Markdown>{message.content}</Markdown>
          </div>
          {message.errorMeta && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {message.errorMeta.actionType === 'settings' && onOpenSettings && (
                <button
                  onClick={onOpenSettings}
                  className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 px-3 py-1 text-xs text-neutral-600 transition hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                >
                  <Settings className="h-3.5 w-3.5" />
                  前往设置
                </button>
              )}
              {message.errorMeta.actionType === 'retry' && onRetryMessage && (
                <button
                  onClick={onRetryMessage}
                  className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 px-3 py-1 text-xs text-neutral-600 transition hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  手动重试
                </button>
              )}
              <button
                onClick={() => {
                  navigator.clipboard.writeText(message.errorMeta?.rawError ?? '').catch(() => {});
                }}
                className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 px-3 py-1 text-xs text-neutral-600 transition hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
              >
                <Copy className="h-3.5 w-3.5" />
                复制错误详情
              </button>
            </div>
          )}
          {!isLoading && (
            <MessageFeedbackComponent messageId={message.id} conversationId={conversationId} />
          )}
        </article>
      </div>
    );
  }

  // Group consecutive thinking/tool blocks together
  const groupedBlocks: (ContentBlock | ContentBlock[])[] = [];
  let currentGroup: ContentBlock[] = [];

  for (const block of message.content) {
    if (block.type === 'text') {
      // If we have a group, add it before the text block
      if (currentGroup.length > 0) {
        groupedBlocks.push([...currentGroup]);
        currentGroup = [];
      }
      groupedBlocks.push(block);
    } else if (block.type === 'thinking' || block.type === 'tool_use') {
      // Add to current group
      currentGroup.push(block);
    }
  }

  // Add any remaining group
  if (currentGroup.length > 0) {
    groupedBlocks.push(currentGroup);
  }

  // Determine which BlockGroup is the latest active section
  // Find the last BlockGroup index
  const lastBlockGroupIndex = groupedBlocks.findLastIndex((item) => Array.isArray(item));

  // Check if there are any incomplete blocks (still streaming)
  const hasIncompleteBlocks = message.content.some((block) => {
    if (block.type === 'thinking') {
      return !block.isComplete;
    }
    if (block.type === 'tool_use') {
      // Tool is incomplete if it doesn't have a result yet
      return !block.tool?.result;
    }
    return false;
  });

  const isStreaming = isLoading && hasIncompleteBlocks;

  return (
    <div ref={ref} className="flex justify-start">
      <article className="w-full px-3 py-2">
        <div className="space-y-3">
          {groupedBlocks.map((item, index) => {
            // Single text block
            if (!Array.isArray(item)) {
              if (item.type === 'text' && item.text) {
                return (
                  <div
                    key={index}
                    className="prose prose-base max-w-none text-base leading-relaxed prose-neutral dark:prose-invert"
                  >
                    <Markdown>{item.text}</Markdown>
                  </div>
                );
              }
              return null;
            }

            // Group of thinking/tool blocks
            const isLatestActiveSection = index === lastBlockGroupIndex;
            const hasTextAfter =
              index < groupedBlocks.length - 1 &&
              groupedBlocks
                .slice(index + 1)
                .some((nextItem) => !Array.isArray(nextItem) && nextItem.type === 'text');

            const deliverables = extractDeliverables(item);

            return (
              <div key={`group-${index}`} className="space-y-2">
                <BlockGroup
                  blocks={item}
                  isLatestActiveSection={isLatestActiveSection}
                  isStreaming={isStreaming}
                  hasTextAfter={hasTextAfter}
                />
                {deliverables.map((d) => (
                  <DeliverableCard key={d.id} deliverable={d} onPreview={onDeliverablePreview} />
                ))}
              </div>
            );
          })}
        </div>
        {!isLoading && (
          <MessageFeedbackComponent messageId={message.id} conversationId={conversationId} />
        )}
      </article>
    </div>
  );
});

export default Message;
