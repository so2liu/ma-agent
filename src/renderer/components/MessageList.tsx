import { Loader2 } from 'lucide-react';

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton
} from '@/components/ai-elements/conversation';
import type { Deliverable } from '@/components/DeliverableCard';
import Message from '@/components/Message';
import type { Message as MessageType } from '@/types/chat';

interface MessageListProps {
  messages: MessageType[];
  isLoading: boolean;
  bottomPadding?: number;
  onDeliverablePreview?: (deliverable: Deliverable) => void;
  conversationId?: string | null;
  onRetryMessage?: () => void;
  onOpenSettings?: () => void;
}

function ConversationMessages({
  messages,
  isLoading,
  bottomPadding,
  conversationId,
  onDeliverablePreview,
  onRetryMessage,
  onOpenSettings
}: MessageListProps) {
  if (messages.length === 0 && !isLoading) {
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
    <div className="flex flex-col" style={{ paddingBottom: bottomPadding ?? 0 }}>
      {messages.map((message, index) => (
        <div key={message.id} className="mx-auto w-full max-w-3xl">
          <Message
            message={message}
            isLoading={isLoading && index === messages.length - 1}
            onDeliverablePreview={onDeliverablePreview}
            conversationId={conversationId}
            onRetryMessage={onRetryMessage}
            onOpenSettings={onOpenSettings}
          />
        </div>
      ))}

      {isLoading && (
        <div className="mx-auto flex w-full max-w-3xl items-center gap-2 px-3 py-1.5 text-xs text-neutral-400 dark:text-neutral-500">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>正在回复…</span>
        </div>
      )}
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
        <ConversationMessages
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
