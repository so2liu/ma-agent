import { Hono } from 'hono';
import { cors } from 'hono/cors';

import { rateLimiter } from './middleware/rate-limit';
import { parseRoute } from './routes/parse';

const app = new Hono();

app.use('*', cors());
app.use('/api/*', rateLimiter({ windowMs: 60_000, max: 10 }));

app.route('/api', parseRoute);

app.get('/health', (c) => c.json({ ok: true }));

const port = Number(process.env.PORT) || 3456;
console.log(`Parse server running on port ${port}`);

export default {
  port,
  fetch: app.fetch,
};
