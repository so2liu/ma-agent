/** 埋点事件类型 */
export type AnalyticsEventType =
  // 对话相关
  | 'message_sent'
  | 'message_completed'
  | 'message_stopped'
  | 'message_error'
  // 反馈相关
  | 'message_feedback'
  // 会话相关
  | 'conversation_created'
  | 'conversation_deleted'
  | 'conversation_resumed'
  // 功能使用
  | 'model_switched'
  | 'attachment_added'
  | 'tool_used'
  | 'skill_executed'
  // 应用生命周期
  | 'app_launched'
  | 'app_closed'
  | 'settings_changed';

/** 通用埋点事件 */
export interface AnalyticsEvent {
  type: AnalyticsEventType;
  timestamp: number;
  properties?: Record<string, string | number | boolean>;
}

/** 消息反馈评分 */
export type FeedbackRating = 'positive' | 'negative';

/** 消息反馈 */
export interface MessageFeedback {
  messageId: string;
  conversationId?: string;
  rating: FeedbackRating;
  reason?: string;
  comment?: string;
}

/** 埋点设置 */
export interface AnalyticsSettings {
  enabled: boolean;
  shareConversationOnFeedback: boolean;
}
