import {
  Children,
  cloneElement,
  forwardRef,
  isValidElement,
  useMemo,
  useState,
  type ComponentPropsWithoutRef,
  type ReactElement,
  type ReactNode
} from 'react';
import {
  Copy,
  ExternalLink as ExternalLinkIcon,
  FileImage,
  FileText,
  Globe,
  RefreshCw,
  Settings,
  ThumbsDown,
  ThumbsUp,
  type LucideIcon
} from 'lucide-react';

import AttachmentPreviewList from '@/components/AttachmentPreviewList';
import BlockGroup from '@/components/BlockGroup';
import type { Deliverable } from '@/components/DeliverableCard';
import FeedbackDialog from '@/components/MessageFeedback';
import {
  Artifact,
  ArtifactAction,
  ArtifactActions,
  ArtifactDescription,
  ArtifactHeader,
  ArtifactTitle
} from '@/components/ai-elements/artifact';
import {
  Message as AIMessage,
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse
} from '@/components/ai-elements/message';
import { useAnalytics } from '@/hooks/useAnalytics';
import { cn } from '@/lib/utils';
import { messageResponseComponents } from '@/lib/ai-elements-adapters';
import type { ContentBlock, Message as MessageType, WriteInput } from '@/types/chat';

import type { FeedbackRating } from '../../shared/types/analytics';
import { getArtifactType, getFileExtension } from '../../shared/file-extensions';

interface MessageProps {
  message: MessageType;
  isLoading?: boolean;
  onDeliverablePreview?: (deliverable: Deliverable) => void;
  conversationId?: string | null;
  onRetryMessage?: () => void;
  onOpenSettings?: () => void;
}

const CODE_COLLAPSE_LINE_THRESHOLD = 200;

const DELIVERABLE_TYPE_CONFIG: Record<string, { icon: LucideIcon; label: string }> = {
  html: { icon: Globe, label: '网页' },
  image: { icon: FileImage, label: '图片' },
  markdown: { icon: FileText, label: '文档' },
  text: { icon: FileText, label: '文本' }
};

function flattenTextContent(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map((child) => flattenTextContent(child)).join('');
  }

  if (isValidElement(node)) {
    return flattenTextContent((node.props as { children?: ReactNode }).children);
  }

  return '';
}

function CollapsiblePre({ children, ...props }: ComponentPropsWithoutRef<'pre'>) {
  const childArray = Children.toArray(children);
  const codeChild = childArray[0];
  const codeElement =
    isValidElement(codeChild) ? (codeChild as ReactElement<{ children?: ReactNode }>) : null;
  const rawCode = useMemo(
    () => (codeElement ? flattenTextContent(codeElement.props.children) : ''),
    [codeElement]
  );
  const normalizedCode = rawCode.replace(/\n$/, '');
  const lineCount = normalizedCode.length === 0 ? 0 : normalizedCode.split('\n').length;

  if (!codeElement) {
    return <pre {...props}>{children}</pre>;
  }

  return (
    <CollapsibleCodeBlock
      key={normalizedCode}
      codeElement={codeElement}
      rawCode={rawCode}
      lineCount={lineCount}
      preProps={props}
    />
  );
}

function CollapsibleCodeBlock({
  codeElement,
  rawCode,
  lineCount,
  preProps
}: {
  codeElement: ReactElement<{ children?: ReactNode }>;
  rawCode: string;
  lineCount: number;
  preProps: ComponentPropsWithoutRef<'pre'>;
}) {
  const isCollapsible = lineCount > CODE_COLLAPSE_LINE_THRESHOLD;
  const [isExpanded, setIsExpanded] = useState(!isCollapsible);
  const normalizedCode = rawCode.replace(/\n$/, '');

  const displayedCode =
    isCollapsible && !isExpanded ?
      normalizedCode.split('\n').slice(0, CODE_COLLAPSE_LINE_THRESHOLD).join('\n')
    : rawCode;

  return (
    <div className="not-prose">
      <pre {...preProps}>{cloneElement(codeElement, { children: displayedCode })}</pre>
      {isCollapsible && (
        <button
          type="button"
          onClick={() => setIsExpanded((prev) => !prev)}
          className="mt-2 inline-flex rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          {isExpanded ? '收起代码' : '展开完整代码'}
        </button>
      )}
    </div>
  );
}

const messageComponents = {
  ...messageResponseComponents,
  pre: CollapsiblePre
};

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

function DeliverableArtifactCard({
  deliverable,
  onPreview
}: {
  deliverable: Deliverable;
  onPreview?: (deliverable: Deliverable) => void;
}) {
  const config = DELIVERABLE_TYPE_CONFIG[deliverable.type];
  if (!config) {
    return null;
  }

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
            icon={ExternalLinkIcon}
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

function getAssistantMessageCopyText(message: MessageType): string {
  if (typeof message.content === 'string') {
    return message.content;
  }

  return message.content
    .filter((block) => block.type === 'text' && Boolean(block.text))
    .map((block) => block.text?.trim() ?? '')
    .filter(Boolean)
    .join('\n\n');
}

interface AssistantMessageActionsProps {
  message: MessageType;
  isLoading: boolean;
  conversationId?: string | null;
  onRetryMessage?: () => void;
  onOpenSettings?: () => void;
}

function AssistantMessageActions({
  message,
  isLoading,
  conversationId,
  onRetryMessage,
  onOpenSettings
}: AssistantMessageActionsProps) {
  const { submitFeedback } = useAnalytics();
  const [feedbackRating, setFeedbackRating] = useState<FeedbackRating | null>(null);
  const [hasSubmittedFeedback, setHasSubmittedFeedback] = useState(false);
  const [isFeedbackDialogOpen, setIsFeedbackDialogOpen] = useState(false);
  const copyText = getAssistantMessageCopyText(message);
  const canCopy = copyText.trim().length > 0;

  const handleCopy = () => {
    if (!canCopy) return;
    navigator.clipboard.writeText(copyText).catch(() => {});
  };

  const handlePositiveFeedback = () => {
    if (hasSubmittedFeedback) return;

    setFeedbackRating('positive');
    setHasSubmittedFeedback(true);
    setIsFeedbackDialogOpen(false);
    submitFeedback({
      messageId: message.id,
      conversationId: conversationId ?? undefined,
      rating: 'positive'
    });
  };

  const handleNegativeFeedback = () => {
    if (hasSubmittedFeedback) return;
    setIsFeedbackDialogOpen(true);
  };

  const handleNegativeSubmitted = () => {
    setFeedbackRating('negative');
    setHasSubmittedFeedback(true);
  };

  if (!canCopy && !message.errorMeta && isLoading) {
    return null;
  }

  return (
    <>
      <MessageActions className="mt-3 flex-wrap items-center gap-1">
        {canCopy && (
          <MessageAction
            onClick={handleCopy}
            tooltip="复制回复"
            label="复制回复"
            className="text-muted-foreground hover:text-foreground"
          >
            <Copy className="h-3.5 w-3.5" />
          </MessageAction>
        )}
        {!isLoading && (
          <>
            <MessageAction
              onClick={handlePositiveFeedback}
              tooltip="有帮助"
              label="有帮助"
              className={cn(
                'text-muted-foreground hover:text-foreground',
                feedbackRating === 'positive' && 'text-emerald-600 hover:text-emerald-600'
              )}
            >
              <ThumbsUp className="h-3.5 w-3.5" />
            </MessageAction>
            <MessageAction
              onClick={handleNegativeFeedback}
              tooltip="需改进"
              label="需改进"
              className={cn(
                'text-muted-foreground hover:text-foreground',
                feedbackRating === 'negative' && 'text-destructive hover:text-destructive'
              )}
            >
              <ThumbsDown className="h-3.5 w-3.5" />
            </MessageAction>
          </>
        )}
        {hasSubmittedFeedback && (
          <span className="ml-1 text-xs text-muted-foreground/70">谢谢反馈</span>
        )}
        {message.errorMeta?.actionType === 'settings' && onOpenSettings && (
          <MessageAction
            onClick={onOpenSettings}
            className="rounded-full border border-border bg-background px-3 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            size="sm"
            variant="outline"
            label="前往设置"
          >
            <Settings className="h-3.5 w-3.5" />
            前往设置
          </MessageAction>
        )}
        {message.errorMeta?.actionType === 'retry' && onRetryMessage && (
          <MessageAction
            onClick={onRetryMessage}
            className="rounded-full border border-border bg-background px-3 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            size="sm"
            variant="outline"
            label="手动重试"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            手动重试
          </MessageAction>
        )}
        {message.errorMeta && (
          <MessageAction
            onClick={() => {
              navigator.clipboard.writeText(message.errorMeta?.rawError ?? '').catch(() => {});
            }}
            className="rounded-full border border-border bg-background px-3 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            size="sm"
            variant="outline"
            label="复制错误详情"
          >
            <Copy className="h-3.5 w-3.5" />
            复制错误详情
          </MessageAction>
        )}
      </MessageActions>
      {!isLoading && (
        <FeedbackDialog
          open={isFeedbackDialogOpen}
          onOpenChange={setIsFeedbackDialogOpen}
          messageId={message.id}
          conversationId={conversationId}
          onSubmitted={handleNegativeSubmitted}
        />
      )}
    </>
  );
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
        mimeType: attachment.mimeType,
        isImage: attachment.isImage ?? attachment.mimeType.startsWith('image/'),
        previewUrl: attachment.previewUrl,
        savedPath: attachment.savedPath,
        relativePath: attachment.relativePath,
        footnoteLines: [attachment.relativePath ?? attachment.savedPath].filter(
          (line): line is string => Boolean(line)
        )
      })) ?? [];

    return (
      <div ref={ref}>
        <AIMessage from="user" className="px-1">
          <MessageContent className="relative max-w-[min(34rem,calc(100%-2rem))] rounded-2xl border border-border bg-card px-3 py-2 text-base leading-relaxed text-foreground shadow-sm group-[.is-user]:bg-card group-[.is-user]:px-3 group-[.is-user]:py-2 group-[.is-user]:text-foreground">
            {hasText && (
              <MessageResponse className="text-base leading-relaxed" components={messageComponents}>
                {userContent}
              </MessageResponse>
            )}
            {hasAttachments && (
              <div className={hasText ? 'mt-2' : ''}>
                <AttachmentPreviewList attachments={attachmentItems} />
              </div>
            )}
          </MessageContent>
        </AIMessage>
      </div>
    );
  }

  // Assistant message
  if (typeof message.content === 'string') {
    return (
      <div ref={ref}>
        <AIMessage from="assistant" className="max-w-full">
          <MessageContent className="w-full px-3 py-2 text-base leading-relaxed">
            <MessageResponse className="text-base leading-relaxed" components={messageComponents}>
              {message.content}
            </MessageResponse>
          </MessageContent>
          <AssistantMessageActions
            message={message}
            isLoading={isLoading}
            conversationId={conversationId}
            onRetryMessage={onRetryMessage}
            onOpenSettings={onOpenSettings}
          />
        </AIMessage>
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
    <div ref={ref}>
      <AIMessage from="assistant" className="max-w-full">
        <MessageContent className="w-full px-3 py-2 text-base leading-relaxed">
          <div className="space-y-3 overflow-hidden">
            {groupedBlocks.map((item, index) => {
              // Single text block
              if (!Array.isArray(item)) {
                if (item.type === 'text' && item.text) {
                  return (
                    <MessageResponse
                      key={index}
                      className="text-base leading-relaxed"
                      components={messageComponents}
                    >
                      {item.text}
                    </MessageResponse>
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
                    <DeliverableArtifactCard
                      key={d.id}
                      deliverable={d}
                      onPreview={onDeliverablePreview}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        </MessageContent>
        <AssistantMessageActions
          message={message}
          isLoading={isLoading}
          conversationId={conversationId}
          onRetryMessage={onRetryMessage}
          onOpenSettings={onOpenSettings}
        />
      </AIMessage>
    </div>
  );
});

export default Message;
