import { Loader2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

import type { Deliverable } from '@/components/DeliverableCard';
import Message from '@/components/Message';
import type { Message as MessageType } from '@/types/chat';

const BOTTOM_SNAP_THRESHOLD_PX = 32;

interface MessageListProps {
  messages: MessageType[];
  isLoading: boolean;
  bottomPadding?: number;
  onDeliverablePreview?: (deliverable: Deliverable) => void;
  conversationId?: string | null;
  onRetryMessage?: () => void;
  onOpenSettings?: () => void;
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const isAutoScrollEnabledRef = useRef(true);
  const previousItemCountRef = useRef(0);
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

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) {
      return;
    }

    const handleScroll = () => {
      const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
      isAutoScrollEnabledRef.current = distanceFromBottom <= BOTTOM_SNAP_THRESHOLD_PX;
    };

    handleScroll();
    element.addEventListener('scroll', handleScroll, { passive: true });
    return () => element.removeEventListener('scroll', handleScroll);
  }, []);

  // Reset auto-scroll when switching conversations
  useEffect(() => {
    isAutoScrollEnabledRef.current = true;
  }, [conversationId]);

  // Track last message content length for streaming auto-scroll
  const lastMessage = messages[messages.length - 1];
  const lastMessageContentLength =
    lastMessage ?
      typeof lastMessage.content === 'string' ? lastMessage.content.length
      : lastMessage.content.reduce((acc, block) => {
          return acc + (block.text?.length ?? 0) + (block.thinking?.length ?? 0);
        }, lastMessage.content.length)
    : 0;

  useEffect(() => {
    if (!isAutoScrollEnabledRef.current || totalItems === 0) {
      previousItemCountRef.current = totalItems;
      return;
    }

    virtualizer.scrollToIndex(totalItems - 1, { align: 'end' });
    previousItemCountRef.current = totalItems;
  }, [totalItems, lastMessageContentLength, virtualizer]);

  const totalHeight = virtualizer.getTotalSize() + (bottomPadding ?? 0);

  return (
    <div
      ref={scrollRef}
      className="relative flex-1 overflow-y-auto px-3 pt-14 pb-3"
      style={{ background: 'var(--color-content-bg)' }}
    >
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
    </div>
  );
}
