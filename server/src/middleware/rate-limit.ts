import type { Context, MiddlewareHandler, Next } from 'hono';

interface RateLimitOptions {
  windowMs: number;
  max: number;
}

interface ClientRecord {
  count: number;
  resetAt: number;
}

export function rateLimiter(options: RateLimitOptions): MiddlewareHandler {
  const clients = new Map<string, ClientRecord>();

  // Cleanup expired entries every minute
  setInterval(() => {
    const now = Date.now();
    for (const [key, record] of clients) {
      if (now > record.resetAt) {
        clients.delete(key);
      }
    }
  }, 60_000);

  return async (c: Context, next: Next) => {
    const ip =
      c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
      c.req.header('x-real-ip') ||
      'unknown';

    const now = Date.now();
    let record = clients.get(ip);

    if (!record || now > record.resetAt) {
      record = { count: 0, resetAt: now + options.windowMs };
      clients.set(ip, record);
    }

    record.count++;

    if (record.count > options.max) {
      return c.json({ error: 'rate_limit_exceeded' }, 429);
    }

    await next();
  };
}
