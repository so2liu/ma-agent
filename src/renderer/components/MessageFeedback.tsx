import { useState } from 'react';

import { useAnalytics } from '@/hooks/useAnalytics';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

const NEGATIVE_REASONS = [
  { id: 'incorrect', label: '回答不正确' },
  { id: 'incomplete', label: '回答不完整' },
  { id: 'irrelevant', label: '没有回答我的问题' },
  { id: 'too_slow', label: '响应太慢' },
  { id: 'tool_error', label: '工具调用出错' },
  { id: 'other', label: '其他' }
 ] as const;

interface FeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  messageId: string;
  conversationId?: string | null;
  onSubmitted: () => void;
}

function FeedbackDialogContent({
  onClose,
  messageId,
  conversationId,
  onSubmitted
}: Omit<FeedbackDialogProps, 'open' | 'onOpenChange'> & { onClose: () => void }) {
  const { submitFeedback } = useAnalytics();
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [comment, setComment] = useState('');

  const handleSubmitNegative = () => {
    submitFeedback({
      messageId,
      conversationId: conversationId ?? undefined,
      rating: 'negative',
      reason: selectedReason ?? undefined,
      comment: comment.trim() || undefined
    });
    onSubmitted();
    onClose();
  };

  return (
    <DialogContent className="max-w-lg p-0">
      <div className="space-y-5 px-6 py-5">
        <DialogHeader className="space-y-1">
          <DialogTitle>反馈这条回复</DialogTitle>
          <DialogDescription>选择问题原因，并补充可选说明。</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <p className="text-xs font-medium text-neutral-600 dark:text-neutral-300">请选择原因</p>
          <div className="flex flex-wrap gap-2">
            {NEGATIVE_REASONS.map((reason) => (
              <button
                key={reason.id}
                onClick={() => setSelectedReason(selectedReason === reason.id ? null : reason.id)}
                type="button"
                className={cn(
                  'rounded-full border px-2.5 py-1 text-[11px] transition',
                  selectedReason === reason.id ?
                    'border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900'
                  : 'border-neutral-200 text-neutral-600 hover:border-neutral-300 dark:border-neutral-700 dark:text-neutral-400 dark:hover:border-neutral-600'
                )}
              >
                {reason.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-neutral-600 dark:text-neutral-300">补充说明</p>
          <Textarea
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="补充说明（可选）"
            className="min-h-24 resize-y border-neutral-200 bg-neutral-50 text-sm shadow-none dark:border-neutral-700 dark:bg-neutral-900"
            rows={4}
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button onClick={onClose} size="sm" type="button" variant="outline">
            取消
          </Button>
          <Button onClick={handleSubmitNegative} size="sm" type="button">
            提交
          </Button>
        </div>
      </div>
    </DialogContent>
  );
}

export default function FeedbackDialog({
  open,
  onOpenChange,
  messageId,
  conversationId,
  onSubmitted
}: FeedbackDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <FeedbackDialogContent
          key={`${messageId}-${open ? 'open' : 'closed'}`}
          conversationId={conversationId}
          messageId={messageId}
          onClose={() => onOpenChange(false)}
          onSubmitted={onSubmitted}
        />
      )}
    </Dialog>
  );
}
