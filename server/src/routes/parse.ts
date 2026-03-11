import { Hono } from 'hono';

import { extractApiConfig } from '../lib/extractor';

export const parseRoute = new Hono();

parseRoute.post('/parse-config', async (c) => {
  // Body already parsed by hmac-auth middleware (it consumes the stream for signing)
  const body = c.get('parsedBody') as { text?: string } | undefined;
  const text = body?.text?.trim();

  if (!text) {
    return c.json({ error: 'no_valid_info' }, 400);
  }

  if (text.length > 5000) {
    return c.json({ error: 'text_too_long' }, 400);
  }

  const result = await extractApiConfig(text);
  return c.json(result);
});
