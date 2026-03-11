import { Hono } from 'hono';
import Anthropic from '@anthropic-ai/sdk';

const EXTRACTOR_MODEL = process.env.EXTRACTOR_MODEL || 'anthropic/claude-haiku-4.5';

const SYSTEM_PROMPT = `You are an AI model selector. Given a list of available model IDs, recommend the best model for each of 3 tiers:

- fast (快速): Fastest and cheapest model for simple tasks. Prefer models with "mini", "flash", "haiku", "lite" in name.
- smart-sonnet (均衡): Balanced model for everyday use at reasonable cost. Prefer models with "sonnet", "gpt-4.1", "gemini-2.0-flash", "deepseek-chat" in name.
- smart-opus (强力): Most capable model for complex reasoning. Prefer models with "opus", "gpt-4.5", "o3", "gemini-2.5-pro", "deepseek-r1" in name.

Rules:
- Each recommended model MUST be from the provided list exactly (case-sensitive match)
- Pick 3 DIFFERENT models when possible
- Output ONLY valid JSON: {"fast": "model-id", "smart-sonnet": "model-id", "smart-opus": "model-id"}
- If the list has fewer than 3 models, reuse models across tiers
- NEVER include any text outside the JSON object`;

interface RecommendResult {
  fast?: string;
  'smart-sonnet'?: string;
  'smart-opus'?: string;
  error?: string;
}

const client = new Anthropic();

export async function recommendModels(models: string[]): Promise<RecommendResult> {
  try {
    const response = await client.messages.create({
      model: EXTRACTOR_MODEL,
      max_tokens: 256,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `Available models:\n${models.join('\n')}` }],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      return { error: 'no_response' };
    }

    // Strip markdown code fences if present
    const jsonText = content.text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
    const parsed = JSON.parse(jsonText) as RecommendResult;

    if (!parsed.fast && !parsed['smart-sonnet'] && !parsed['smart-opus']) {
      return { error: 'no_valid_recommendation' };
    }

    return parsed;
  } catch {
    return { error: 'recommend_failed' };
  }
}

export const recommendRoute = new Hono();

recommendRoute.post('/recommend-models', async (c) => {
  const body = c.get('parsedBody') as { models?: string[] } | undefined;
  const models = body?.models;

  if (!models || !Array.isArray(models) || models.length === 0) {
    return c.json({ error: 'models_required' }, 400);
  }

  if (models.length > 1000) {
    return c.json({ error: 'too_many_models' }, 400);
  }

  const result = await recommendModels(models);
  return c.json(result);
});
