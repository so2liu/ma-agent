import { query } from '@anthropic-ai/claude-agent-sdk';
import type { SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';

import {
  getModelIdForPreference,
  resolveClaudeCodeCli,
  SYSTEM_PROMPT_APPEND
} from './claude-session';
import { buildClaudeSessionEnv, getApiKey, getWorkspaceDir } from './config';
import { createConversation } from './conversation-db';
import type { ScheduledTask } from './schedule-db';

export async function executeScheduledTask(task: ScheduledTask): Promise<string> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('API key not configured');

  const env = buildClaudeSessionEnv();
  env.ANTHROPIC_API_KEY = apiKey;

  const modelId = getModelIdForPreference(task.modelPreference);
  const sessionId = `scheduled-${task.id}-${Date.now()}`;

  async function* promptGenerator(): AsyncGenerator<SDKUserMessage> {
    yield {
      type: 'user',
      message: {
        role: 'user' as const,
        content: [{ type: 'text' as const, text: task.prompt }]
      },
      parent_tool_use_id: null,
      session_id: sessionId
    };
  }

  const session = query({
    prompt: promptGenerator(),
    options: {
      model: modelId,
      maxThinkingTokens: 32_000,
      settingSources: ['project'],
      permissionMode: 'acceptEdits',
      allowedTools: ['Bash', 'WebFetch', 'WebSearch', 'Skill'],
      pathToClaudeCodeExecutable: resolveClaudeCodeCli(),
      executable: process.execPath as 'node',
      executableArgs: ['--no-warnings'],
      env: { ...env, ELECTRON_RUN_AS_NODE: '1' },
      systemPrompt: {
        type: 'preset',
        preset: 'claude_code',
        append: `${SYSTEM_PROMPT_APPEND}\n\nThis is a scheduled task execution. Task name: "${task.name}". Execute the prompt and provide results concisely.`
      },
      cwd: getWorkspaceDir()
    }
  });

  const assistantTexts: string[] = [];
  let resultError: string | null = null;

  for await (const event of session) {
    if (event.type === 'assistant') {
      const content = event.message.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (typeof block === 'object' && block !== null && 'text' in block) {
            assistantTexts.push((block as { text: string }).text);
          }
        }
      }
    } else if (event.type === 'result') {
      const subtype = (event as { subtype?: string }).subtype;
      if (subtype && subtype.startsWith('error')) {
        resultError = subtype;
      }
    }
  }

  if (resultError) {
    throw new Error(`Scheduled task ended with SDK error: ${resultError}`);
  }

  // Store messages in the format the renderer expects (Message interface)
  const now = new Date().toISOString();
  const messages = [
    { id: `sched-user-${Date.now()}`, role: 'user', content: task.prompt, timestamp: now },
    {
      id: `sched-asst-${Date.now()}`,
      role: 'assistant',
      content: assistantTexts.join('\n'),
      timestamp: now
    }
  ];

  const conversation = createConversation(`[定时] ${task.name}`, messages);
  return conversation.id;
}
