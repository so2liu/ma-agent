import { Hono } from 'hono';
import { cors } from 'hono/cors';

import { hmacAuth } from './middleware/hmac-auth';
import { rateLimiter } from './middleware/rate-limit';
import { parseRoute } from './routes/parse';
import { recommendRoute } from './routes/recommend';

const HMAC_SECRET = process.env.HMAC_SECRET || 'kfy7-1oO-1oo-OcQ-XxG-t9W-odp-LSm';

const app = new Hono();

app.use(
  '*',
  cors({
    origin: '*', // Electron app uses file:// origin, can't restrict by origin
    allowMethods: ['POST', 'GET'],
    allowHeaders: ['Content-Type', 'X-App-Timestamp', 'X-App-Signature']
  })
);

app.use('/api/*', hmacAuth(HMAC_SECRET));

// General rate limit for parse endpoints
app.use('/api/parse-config', rateLimiter({ windowMs: 60_000, max: 10 }));
// Stricter rate limit for AI recommend (prevent abuse)
app.use('/api/recommend-models', rateLimiter({ windowMs: 60_000, max: 3 }));

app.route('/api', parseRoute);
app.route('/api', recommendRoute);

app.get('/health', (c) => c.json({ ok: true }));

const port = Number(process.env.PORT) || 3456;
console.log(`Parse server running on port ${port}`);

export default {
  port,
  fetch: app.fetch
};
