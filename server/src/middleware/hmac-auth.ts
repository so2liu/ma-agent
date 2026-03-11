import type { Context, MiddlewareHandler, Next } from 'hono';

const MAX_TIMESTAMP_DRIFT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * HMAC-SHA256 authentication middleware.
 * Expects headers:
 *   X-App-Timestamp: unix ms
 *   X-App-Signature: hex(HMAC-SHA256(secret, timestamp + "." + body))
 */
export function hmacAuth(secret: string): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    const timestamp = c.req.header('x-app-timestamp');
    const signature = c.req.header('x-app-signature');

    if (!timestamp || !signature) {
      return c.json({ error: 'missing_auth_headers' }, 401);
    }

    const ts = Number(timestamp);
    if (Number.isNaN(ts) || Math.abs(Date.now() - ts) > MAX_TIMESTAMP_DRIFT_MS) {
      return c.json({ error: 'invalid_timestamp' }, 401);
    }

    // Read body as text for signing, then store for downstream
    const body = await c.req.text();
    const message = `${timestamp}.${body}`;

    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
    const expected = Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    if (!timingSafeEqual(expected, signature)) {
      return c.json({ error: 'invalid_signature' }, 401);
    }

    // Store parsed body so route handlers don't re-read the consumed stream
    try {
      c.set('parsedBody', body ? JSON.parse(body) : {});
    } catch {
      return c.json({ error: 'invalid_json' }, 400);
    }

    await next();
  };
}

/** Constant-time string comparison to prevent timing attacks */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);
  let diff = 0;
  for (let i = 0; i < bufA.length; i++) {
    diff |= bufA[i] ^ bufB[i];
  }
  return diff === 0;
}
