import { Loader2 } from 'lucide-react';
import type { CSSProperties, RefObject } from 'react';

import type { Deliverable } from '@/components/DeliverableCard';
import Message from '@/components/Message';
import type { Message as MessageType } from '@/types/chat';

interface MessageListProps {
  messages: MessageType[];
  isLoading: boolean;
  containerRef: RefObject<HTMLDivElement | null>;
  bottomPadding?: number;
  onDeliverablePreview?: (deliverable: Deliverable) => void;
}

export default function MessageList({
  messages,
  isLoading,
  containerRef,
  bottomPadding,
  onDeliverablePreview
}: MessageListProps) {
  const containerStyle: CSSProperties | undefined =
    bottomPadding ? { paddingBottom: bottomPadding } : undefined;

  return (
    <div
      ref={containerRef}
      className="relative flex-1 overflow-y-auto px-3 pt-14 pb-3"
      style={{ background: 'var(--color-content-bg)', ...containerStyle }}
    >
      <div className="mx-auto max-w-3xl space-y-1.5">
        {messages.map((message, index) => (
          <Message
            key={message.id}
            message={message}
            isLoading={isLoading && index === messages.length - 1}
            onDeliverablePreview={onDeliverablePreview}
          />
        ))}
        {isLoading && (
          <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-neutral-400 dark:text-neutral-500">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>正在回复…</span>
          </div>
        )}
      </div>
    </div>
  );
}
