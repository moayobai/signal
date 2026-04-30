import rateLimit from '@fastify/rate-limit';
import helmet from '@fastify/helmet';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { timingSafeEqual } from 'node:crypto';

export interface SecurityOptions {
  authToken?: string;
  authDisabled?: boolean;
  rateLimitMax?: number;
  rateLimitWindow?: string | number;
  secureCookies?: boolean;
}

const AUTH_COOKIE = 'signal_auth';

function parseCookie(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
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

function cleanTokenFromUrl(url: string): string {
  const parsed = new URL(url, 'http://signal.local');
  parsed.searchParams.delete('token');
  const path = `${parsed.pathname}${parsed.search}${parsed.hash}`;
  return path || '/';
}

function authCookie(authToken: string, secure: boolean): string {
  const attrs = [
    `${AUTH_COOKIE}=${encodeURIComponent(authToken)}`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    'Max-Age=2592000',
  ];
  if (secure) attrs.push('Secure');
  return attrs.join('; ');
}

export async function registerSecurity(app: FastifyInstance, opts: SecurityOptions): Promise<void> {
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        connectSrc: ["'self'", 'ws:', 'wss:'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        mediaSrc: ["'self'", 'blob:'],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        upgradeInsecureRequests: opts.secureCookies ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
  });

  await app.register(rateLimit, {
    max: opts.rateLimitMax ?? 120,
    timeWindow: opts.rateLimitWindow ?? '1 minute',
    allowList: req => isPublicPath(req.url),
  });

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
      reply.header('set-cookie', authCookie(authToken, opts.secureCookies ?? false));
      if (req.method === 'GET' && req.url.startsWith('/dashboard/')) {
        return reply.redirect(cleanTokenFromUrl(req.url), 302);
      }
    }
  });
}
