import { useCallback } from 'react';

import type { AnalyticsEventType, MessageFeedback } from '../../shared/types/analytics';

export function useAnalytics() {
  const track = useCallback(
    (type: AnalyticsEventType, properties?: Record<string, string | number | boolean>) => {
      window.electron.analytics.trackEvent({
        type,
        timestamp: Date.now(),
        properties
      });
    },
    []
  );

  const submitFeedback = useCallback((feedback: MessageFeedback) => {
    window.electron.analytics.submitFeedback(feedback);
  }, []);

  return { track, submitFeedback };
}
