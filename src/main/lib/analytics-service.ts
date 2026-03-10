import { randomUUID } from 'crypto';
import { app } from 'electron';
import { PostHog } from 'posthog-node';

import type {
  AnalyticsEvent,
  AnalyticsSettings,
  MessageFeedback
} from '../../shared/types/analytics';
import { loadConfig, saveConfig } from './config';

const POSTHOG_API_KEY =
  process.env.POSTHOG_API_KEY ?? 'phc_edveghHyU8AI3VDiJdA1UgTc5BFgiCQU0tGbtuIoIET';
// 使用 EU 端点，中国大陆访问更稳定
const POSTHOG_HOST = process.env.POSTHOG_HOST ?? 'https://eu.i.posthog.com';

let posthogClient: PostHog | null = null;

function getClient(): PostHog {
  if (!posthogClient) {
    posthogClient = new PostHog(POSTHOG_API_KEY, {
      host: POSTHOG_HOST,
      flushAt: 20,
      flushInterval: 30000
    });
  }
  return posthogClient;
}

function getOrCreateAnonymousId(): string {
  const config = loadConfig();
  if ((config as Record<string, unknown>).anonymousId) {
    return (config as Record<string, unknown>).anonymousId as string;
  }
  const id = randomUUID();
  (config as Record<string, unknown>).anonymousId = id;
  saveConfig(config);
  return id;
}

export function getAnalyticsSettings(): AnalyticsSettings {
  const config = loadConfig() as Record<string, unknown>;
  return {
    enabled: (config.analyticsEnabled as boolean) ?? false,
    shareConversationOnFeedback: (config.analyticsShareConversation as boolean) ?? false
  };
}

export function setAnalyticsSettings(settings: Partial<AnalyticsSettings>): AnalyticsSettings {
  const config = loadConfig() as Record<string, unknown>;
  if (settings.enabled !== undefined) {
    config.analyticsEnabled = settings.enabled;
    // Shut down the PostHog client on opt-out to discard any buffered events
    if (!settings.enabled && posthogClient) {
      posthogClient.shutdown().catch((error) => {
        console.error('Analytics shutdown on opt-out error:', error);
      });
      posthogClient = null;
    }
  }
  if (settings.shareConversationOnFeedback !== undefined) {
    config.analyticsShareConversation = settings.shareConversationOnFeedback;
  }
  saveConfig(config as ReturnType<typeof loadConfig>);
  return getAnalyticsSettings();
}

export function trackEvent(event: AnalyticsEvent): void {
  try {
    const settings = getAnalyticsSettings();
    if (!settings.enabled) return;

    const client = getClient();
    const distinctId = getOrCreateAnonymousId();

    client.capture({
      distinctId,
      event: event.type,
      properties: {
        ...event.properties,
        timestamp: event.timestamp,
        appVersion: app.getVersion(),
        platform: process.platform
      }
    });
  } catch (error) {
    console.error('Analytics trackEvent error:', error);
  }
}

export function submitFeedback(feedback: MessageFeedback): void {
  try {
    const settings = getAnalyticsSettings();
    if (!settings.enabled) return;

    const client = getClient();
    const distinctId = getOrCreateAnonymousId();

    client.capture({
      distinctId,
      event: 'message_feedback',
      properties: {
        messageId: feedback.messageId,
        conversationId: feedback.conversationId ?? '',
        rating: feedback.rating,
        reason: feedback.reason ?? '',
        comment: feedback.comment ?? '',
        appVersion: app.getVersion(),
        platform: process.platform
      }
    });
  } catch (error) {
    console.error('Analytics submitFeedback error:', error);
  }
}

export async function shutdownAnalytics(): Promise<void> {
  try {
    if (posthogClient) {
      await posthogClient.shutdown();
      posthogClient = null;
    }
  } catch (error) {
    console.error('Analytics shutdown error:', error);
  }
}
