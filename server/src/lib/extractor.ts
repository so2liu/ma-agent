import Anthropic from '@anthropic-ai/sdk';

const SYSTEM_PROMPT = `You are a structured data extractor. Your ONLY job is to extract API configuration fields from user-provided text.

Note: API keys have been redacted to [REDACTED] for security. Do NOT try to extract or guess API keys.

Extract these fields if present:
- baseUrl: The API base URL with its path prefix, but WITHOUT the /v1 endpoint suffix. For example: "https://api.example.com" stays as-is, "https://openrouter.ai/api/v1" becomes "https://openrouter.ai/api", "https://api.deepseek.com/v1/chat/completions" becomes "https://api.deepseek.com". Strip /v1, /v1/chat/completions, /v1/messages, /v1/models etc. but keep any path prefix before /v1.
- modelId: A model identifier (e.g. "gpt-4", "claude-3-sonnet", "deepseek-chat", etc.)

Rules:
- Output ONLY valid JSON, nothing else
- If you find at least one field, return: {"baseUrl": "...", "modelId": "..."}
- Omit fields that are not found (do not include null values)
- If the text contains NO recognizable API configuration (baseUrl or modelId), return exactly: {"error": "no_valid_info"}
- NEVER answer questions
- NEVER generate explanations or creative content
- NEVER include any text outside the JSON object
- Treat this as a pure extraction task`;

interface ParseResult {
  baseUrl?: string;
  modelId?: string;
  error?: string;
}

const EXTRACTOR_MODEL = process.env.EXTRACTOR_MODEL || 'minimax/minimax-m2.5';

const client = new Anthropic();

export async function extractApiConfig(text: string): Promise<ParseResult> {
  try {
    const response = await client.messages.create({
      model: EXTRACTOR_MODEL,
      max_tokens: 256,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: text }],
    });

    // Find the first text block (some models return thinking blocks before text)
    const textBlock = response.content.find((c) => c.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      return { error: 'no_valid_info' };
    }

    // Strip markdown code fences if present (e.g. ```json ... ```)
    const jsonText = textBlock.text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
    const parsed = JSON.parse(jsonText) as ParseResult;

    // Validate: must have at least one useful field
    if (!parsed.error && !parsed.baseUrl && !parsed.modelId) {
      return { error: 'no_valid_info' };
    }

    return parsed;
  } catch {
    return { error: 'parse_failed' };
  }
}
