import { ThumbsDown, ThumbsUp } from 'lucide-react';
import { useState } from 'react';

import type { FeedbackRating } from '../../shared/types/analytics';
import { useAnalytics } from '@/hooks/useAnalytics';

const NEGATIVE_REASONS = [
  { id: 'incorrect', label: '回答不正确' },
  { id: 'incomplete', label: '回答不完整' },
  { id: 'irrelevant', label: '没有回答我的问题' },
  { id: 'too_slow', label: '响应太慢' },
  { id: 'tool_error', label: '工具调用出错' },
  { id: 'other', label: '其他' }
];

interface MessageFeedbackProps {
  messageId: string;
  conversationId?: string | null;
}

export default function MessageFeedback({ messageId, conversationId }: MessageFeedbackProps) {
  const { submitFeedback } = useAnalytics();
  const [rating, setRating] = useState<FeedbackRating | null>(null);
  const [showReasons, setShowReasons] = useState(false);
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handlePositive = () => {
    setRating('positive');
    setShowReasons(false);
    setSubmitted(true);
    submitFeedback({
      messageId,
      conversationId: conversationId ?? undefined,
      rating: 'positive'
    });
  };

  const handleNegative = () => {
    if (rating === 'negative') return;
    setRating('negative');
    setShowReasons(true);
  };

  const handleSubmitNegative = () => {
    setSubmitted(true);
    setShowReasons(false);
    submitFeedback({
      messageId,
      conversationId: conversationId ?? undefined,
      rating: 'negative',
      reason: selectedReason ?? undefined,
      comment: comment.trim() || undefined
    });
  };

  if (submitted) {
    return (
      <div className="mt-1 px-3 text-[11px] text-neutral-400 dark:text-neutral-500">
        谢谢反馈
      </div>
    );
  }

  return (
    <div className="mt-1 px-3">
      <div className="flex items-center gap-1">
        <button
          onClick={handlePositive}
          className={`rounded p-1 transition ${
            rating === 'positive'
              ? 'text-green-500'
              : 'text-neutral-300 hover:text-neutral-500 dark:text-neutral-600 dark:hover:text-neutral-400'
          }`}
          title="有帮助"
        >
          <ThumbsUp className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={handleNegative}
          className={`rounded p-1 transition ${
            rating === 'negative'
              ? 'text-red-500'
              : 'text-neutral-300 hover:text-neutral-500 dark:text-neutral-600 dark:hover:text-neutral-400'
          }`}
          title="需改进"
        >
          <ThumbsDown className="h-3.5 w-3.5" />
        </button>
      </div>

      {showReasons && (
        <div className="mt-2 rounded-lg border border-neutral-200 bg-white p-3 dark:border-neutral-700 dark:bg-neutral-800">
          <p className="mb-2 text-xs font-medium text-neutral-600 dark:text-neutral-300">
            请选择原因：
          </p>
          <div className="flex flex-wrap gap-1.5">
            {NEGATIVE_REASONS.map((reason) => (
              <button
                key={reason.id}
                onClick={() =>
                  setSelectedReason(selectedReason === reason.id ? null : reason.id)
                }
                className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
                  selectedReason === reason.id
                    ? 'border-neutral-800 bg-neutral-800 text-white dark:border-neutral-200 dark:bg-neutral-200 dark:text-neutral-900'
                    : 'border-neutral-200 text-neutral-600 hover:border-neutral-300 dark:border-neutral-600 dark:text-neutral-400 dark:hover:border-neutral-500'
                }`}
              >
                {reason.label}
              </button>
            ))}
          </div>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="补充说明（可选）"
            className="mt-2 w-full rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 text-xs text-neutral-700 placeholder-neutral-400 outline-none focus:border-neutral-400 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-300 dark:placeholder-neutral-500 dark:focus:border-neutral-500"
            rows={2}
          />
          <div className="mt-2 flex justify-end">
            <button
              onClick={handleSubmitNegative}
              className="rounded-lg bg-neutral-900 px-3 py-1 text-[11px] font-medium text-white transition hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
            >
              提交
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
