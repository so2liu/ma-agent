import { Hono } from 'hono';
import { cors } from 'hono/cors';

import { hmacAuth } from './middleware/hmac-auth';
import { rateLimiter } from './middleware/rate-limit';
import { parseRoute } from './routes/parse';

const HMAC_SECRET = process.env.HMAC_SECRET;
if (!HMAC_SECRET) {
  console.error('HMAC_SECRET environment variable is required');
  process.exit(1);
}

const app = new Hono();

app.use(
  '*',
  cors({
    origin: '*', // Electron app uses file:// origin, can't restrict by origin
    allowMethods: ['POST', 'GET'],
    allowHeaders: ['Content-Type', 'X-App-Timestamp', 'X-App-Signature']
  })
);

app.use('/api/*', rateLimiter({ windowMs: 60_000, max: 10 }));
app.use('/api/*', hmacAuth(HMAC_SECRET));

app.route('/api', parseRoute);

app.get('/health', (c) => c.json({ ok: true }));

const port = Number(process.env.PORT) || 3456;
console.log(`Parse server running on port ${port}`);

export default {
  port,
  fetch: app.fetch
};
