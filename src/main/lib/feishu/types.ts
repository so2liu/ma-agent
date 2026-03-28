import type { EventHandles } from '@larksuiteoapi/node-sdk';

export interface FeishuConfig {
  enabled: boolean;
  appId: string;
  appSecret: string;
  conversationId?: string;
}

export type FeishuConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected';

type FeishuMessageReceiveHandler = NonNullable<
  EventHandles['im.message.receive_v1']
>;

export type FeishuMessageEvent = Parameters<FeishuMessageReceiveHandler>[0];
export type FeishuMessageEventSender = FeishuMessageEvent['sender'];
export type FeishuMessageEventMessage = FeishuMessageEvent['message'];
export type FeishuMessageEventMention = NonNullable<
  FeishuMessageEventMessage['mentions']
>[number];
