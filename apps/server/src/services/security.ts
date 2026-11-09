import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { timingSafeEqual } from 'node:crypto';

export interface SecurityOptions {
  authToken?: string;
  authDisabled?: boolean;
  rateLimitMax?: number;
  rateLimitWindow?: string | number;
}

const AUTH_COOKIE = 'signal_auth';
const DEFAULT_RATE_LIMIT_MAX = 120;
const DEFAULT_RATE_LIMIT_WINDOW = '1 minute';

function parseCookie(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(value);
    } catch {
      // Malformed percent-encoding in an unrelated cookie must not 500 the request.
      out[key] = value;
    }
  }
  return out;
}

function tokenFromRequest(req: FastifyRequest): string | null {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) return auth.slice('Bearer '.length).trim();

  const headerToken = req.headers['x-signal-token'];
  if (typeof headerToken === 'string') return headerToken.trim();

  const queryToken = (req.query as { token?: unknown } | undefined)?.token;
  if (typeof queryToken === 'string') return queryToken.trim();

  return parseCookie(req.headers.cookie)[AUTH_COOKIE] ?? null;
}

function safeTokenEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function isPublicPath(url: string): boolean {
  return url === '/health' || url.startsWith('/health?');
}

export async function registerSecurity(app: FastifyInstance, opts: SecurityOptions): Promise<void> {
  // Env-derived values can be NaN / 0 / blank (e.g. SIGNAL_RATE_LIMIT_MAX=abc);
  // fall back to defaults rather than silently disabling or breaking limiting.
  const max = opts.rateLimitMax !== undefined && Number.isFinite(opts.rateLimitMax) && opts.rateLimitMax > 0
    ? Math.floor(opts.rateLimitMax)
    : DEFAULT_RATE_LIMIT_MAX;
  const timeWindow = typeof opts.rateLimitWindow === 'string'
    ? (opts.rateLimitWindow.trim() || DEFAULT_RATE_LIMIT_WINDOW)
    : (opts.rateLimitWindow !== undefined && Number.isFinite(opts.rateLimitWindow) && opts.rateLimitWindow > 0
      ? opts.rateLimitWindow
      : DEFAULT_RATE_LIMIT_WINDOW);
  await app.register(rateLimit, { max, timeWindow });

  if (opts.authDisabled) {
    app.log.warn('[SIGNAL] HTTP auth disabled by SIGNAL_AUTH_DISABLED=true');
    return;
  }

  const authToken = opts.authToken?.trim();
  if (!authToken) {
    throw new Error('SIGNAL_AUTH_TOKEN is required unless SIGNAL_AUTH_DISABLED=true');
  }

  app.addHook('onRequest', async (req, reply) => {
    if (isPublicPath(req.url)) return;

    const token = tokenFromRequest(req);
    if (!token || !safeTokenEqual(token, authToken)) {
      return reply.code(401).send({ error: 'unauthorized' });
    }

    const queryToken = (req.query as { token?: unknown } | undefined)?.token;
    if (typeof queryToken === 'string' && safeTokenEqual(queryToken, authToken)) {
      // Mark Secure when served over HTTPS (directly or behind a TLS-terminating proxy).
      const forwardedProto = req.headers['x-forwarded-proto'];
      const isHttps = req.protocol === 'https' ||
        (typeof forwardedProto === 'string' && forwardedProto.split(',')[0].trim() === 'https');
      reply.header(
        'set-cookie',
        `${AUTH_COOKIE}=${encodeURIComponent(authToken)}; HttpOnly; SameSite=Lax; Path=/${isHttps ? '; Secure' : ''}`,
      );
    }
  });
}
