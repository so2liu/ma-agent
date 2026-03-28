import { Loader2 } from 'lucide-react';
import { useVirtualizer } from '@tanstack/react-virtual';

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton
} from '@/components/ai-elements/conversation';
import type { Deliverable } from '@/components/DeliverableCard';
import Message from '@/components/Message';
import type { Message as MessageType } from '@/types/chat';
import { useStickToBottomContext } from 'stick-to-bottom';

interface MessageListProps {
  messages: MessageType[];
  isLoading: boolean;
  bottomPadding?: number;
  onDeliverablePreview?: (deliverable: Deliverable) => void;
  conversationId?: string | null;
  onRetryMessage?: () => void;
  onOpenSettings?: () => void;
}

function VirtualizedConversationMessages({
  messages,
  isLoading,
  bottomPadding,
  conversationId,
  onDeliverablePreview,
  onRetryMessage,
  onOpenSettings
}: MessageListProps) {
  const { scrollRef } = useStickToBottomContext();
  const totalItems = messages.length + (isLoading ? 1 : 0);

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual is safe here, component is not memoized
  const virtualizer = useVirtualizer({
    count: totalItems,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => {
      if (isLoading && index === totalItems - 1) {
        return 40;
      }

      const message = messages[index];
      if (!message) {
        return 120;
      }

      if (message.role === 'user') {
        return 96;
      }

      return typeof message.content === 'string' ? 220 : 280;
    },
    overscan: 5
  });

  const totalHeight = virtualizer.getTotalSize() + (bottomPadding ?? 0);

  if (totalItems === 0) {
    return (
      <div className="mx-auto flex min-h-full max-w-3xl items-center justify-center">
        <ConversationEmptyState
          title="有什么可以帮你的？"
          description="输入消息开始对话"
        />
      </div>
    );
  }

  return (
    <div className="relative" style={{ height: totalHeight }}>
      {virtualizer.getVirtualItems().map((virtualItem) => {
        const isLoadingRow = isLoading && virtualItem.index === totalItems - 1;
        const message = messages[virtualItem.index];

        return (
          <div
            key={virtualItem.key}
            ref={virtualizer.measureElement}
            className="absolute top-0 left-0 w-full"
            style={{ transform: `translateY(${virtualItem.start}px)` }}
          >
            <div className="mx-auto max-w-3xl">
              {isLoadingRow ?
                <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-neutral-400 dark:text-neutral-500">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>正在回复…</span>
                </div>
              : message && (
                  <Message
                    message={message}
                    isLoading={isLoading && virtualItem.index === messages.length - 1}
                    onDeliverablePreview={onDeliverablePreview}
                    conversationId={conversationId}
                    onRetryMessage={onRetryMessage}
                    onOpenSettings={onOpenSettings}
                  />
                )
              }
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function MessageList({
  messages,
  isLoading,
  bottomPadding,
  onDeliverablePreview,
  conversationId,
  onRetryMessage,
  onOpenSettings
}: MessageListProps) {
  return (
    <Conversation
      key={conversationId ?? 'new-conversation'}
      className="relative flex-1"
      style={{ background: 'var(--color-content-bg)' }}
    >
      <ConversationContent
        className="relative min-h-full gap-0 p-0"
        scrollClassName="h-full overflow-y-auto px-3 pt-14 pb-3"
      >
        <VirtualizedConversationMessages
          messages={messages}
          isLoading={isLoading}
          bottomPadding={bottomPadding}
          onDeliverablePreview={onDeliverablePreview}
          conversationId={conversationId}
          onRetryMessage={onRetryMessage}
          onOpenSettings={onOpenSettings}
        />
      </ConversationContent>
      <ConversationScrollButton
        className="shadow-sm supports-[backdrop-filter]:bg-background/80"
        size="icon-sm"
        style={{ bottom: (bottomPadding ?? 0) + 16 }}
      />
    </Conversation>
  );
}
