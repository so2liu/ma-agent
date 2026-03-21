import { join } from 'path';
import { app } from 'electron';
import {
  AuthStorage,
  createAgentSession,
  createCodingTools,
  DefaultResourceLoader,
  SessionManager as PiSessionManager,
  type AgentSessionEvent
} from '@mariozechner/pi-coding-agent';

import { createConversation } from './conversation-db';
import { getApiKey, getOpenAIApiKey, getWorkspaceDir } from './config';
import {
  getPiModelForPreference,
  resolveModel,
  SYSTEM_PROMPT_APPEND
} from './pi-runtime';
import type { ScheduledTask } from './schedule-db';

export async function executeScheduledTask(task: ScheduledTask): Promise<string> {
  const modelId = getPiModelForPreference(task.modelPreference);
  const model = resolveModel(modelId);
  if (!model) {
    throw new Error(`Could not resolve model: ${modelId}`);
  }

  const workspaceDir = getWorkspaceDir();
  const authStorage = AuthStorage.inMemory();
  const anthropicApiKey = getApiKey();
  if (anthropicApiKey) {
    authStorage.setRuntimeApiKey('anthropic', anthropicApiKey);
  }
  const openAIApiKey = getOpenAIApiKey();
  if (openAIApiKey) {
    authStorage.setRuntimeApiKey('openai', openAIApiKey);
  }
  const resourceLoader = new DefaultResourceLoader({
    cwd: workspaceDir,
    additionalSkillPaths: [join(workspaceDir, '.claude', 'skills')],
    systemPromptOverride: (basePrompt) => {
      const scheduledAppend = `This is a scheduled task execution. Task name: "${task.name}". Execute the prompt and provide results concisely.`;
      if (basePrompt?.trim()) {
        return `${basePrompt}\n\n${SYSTEM_PROMPT_APPEND}\n\n${scheduledAppend}`;
      }
      return `${SYSTEM_PROMPT_APPEND}\n\n${scheduledAppend}`;
    }
  });
  await resourceLoader.reload();

  const { session } = await createAgentSession({
    cwd: workspaceDir,
    authStorage,
    model,
    thinkingLevel: 'medium',
    tools: createCodingTools(workspaceDir),
    resourceLoader,
    sessionManager: PiSessionManager.create(
      workspaceDir,
      join(app.getPath('userData'), 'scheduled-sessions')
    )
  });

  const assistantTexts: string[] = [];
  let finalAssistantText = '';
  let finalError: string | null = null;

  const unsubscribe = session.subscribe((event: AgentSessionEvent) => {
    if (event.type === 'message_update' && event.message.role === 'assistant') {
      const assistantEvent = event.assistantMessageEvent;
      if (assistantEvent.type === 'text_delta') {
        assistantTexts.push(assistantEvent.delta);
      }
    }

    if (event.type === 'message_end' && event.message.role === 'assistant') {
      if (event.message.stopReason === 'error') {
        finalError = event.message.errorMessage || 'Scheduled task failed';
      }

      finalAssistantText = event.message.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('');
    }
  });

  try {
    await session.prompt(task.prompt);
  } finally {
    unsubscribe();
    session.dispose();
  }

  if (finalError) {
    throw new Error(finalError);
  }

  const assistantContent = assistantTexts.join('') || finalAssistantText;
  const now = new Date().toISOString();
  const messages = [
    { id: `sched-user-${Date.now()}`, role: 'user', content: task.prompt, timestamp: now },
    {
      id: `sched-asst-${Date.now()}`,
      role: 'assistant',
      content: assistantContent,
      timestamp: now
    }
  ];

  const conversation = createConversation(`[定时] ${task.name}`, messages, session.sessionId);
  return conversation.id;
}
