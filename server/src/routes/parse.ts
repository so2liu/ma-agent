import { Hono } from 'hono';

import { extractApiConfig } from '../lib/extractor';

export const parseRoute = new Hono();

parseRoute.post('/parse-config', async (c) => {
  const body = await c.req.json<{ text?: string }>().catch(() => ({}));
  const text = body.text?.trim();

  if (!text) {
    return c.json({ error: 'no_valid_info' }, 400);
  }

  if (text.length > 5000) {
    return c.json({ error: 'text_too_long' }, 400);
  }

  const result = await extractApiConfig(text);
  return c.json(result);
});
