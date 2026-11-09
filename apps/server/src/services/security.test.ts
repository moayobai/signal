import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { registerSecurity } from './security.js';

async function buildSecuredApp() {
  const app = Fastify({ logger: false });
  await registerSecurity(app, {
    authToken: 'test-token',
    rateLimitMax: 2,
    rateLimitWindow: '1 minute',
  });
  app.get('/health', async () => ({ ok: true }));
  app.get('/api/private', async () => ({ ok: true }));
  await app.ready();
  return app;
}

describe('security', () => {
  it('allows public health checks without auth', async () => {
    const app = await buildSecuredApp();
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('rejects protected routes without a token', async () => {
    const app = await buildSecuredApp();
    const res = await app.inject({ method: 'GET', url: '/api/private' });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'unauthorized' });
    await app.close();
  });

  it('accepts bearer tokens on protected routes', async () => {
    const app = await buildSecuredApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/private',
      headers: { authorization: 'Bearer test-token' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    await app.close();
  });

  it('sets an auth cookie when the dashboard token query is valid', async () => {
    const app = await buildSecuredApp();
    const res = await app.inject({ method: 'GET', url: '/api/private?token=test-token' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['set-cookie']).toContain('signal_auth=');
    await app.close();
  });

  it('rate limits repeated requests', async () => {
    const app = await buildSecuredApp();
    const headers = { authorization: 'Bearer test-token' };
    expect((await app.inject({ method: 'GET', url: '/api/private', headers })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/private', headers })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/private', headers })).statusCode).toBe(429);
    await app.close();
  });
});

describe('security — regressions', () => {
  it('does not 500 when an unrelated cookie has malformed percent-encoding', async () => {
    const app = await buildSecuredApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/private',
      headers: { cookie: 'other=%E0%A4%A; signal_auth=test-token' },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('marks the auth cookie Secure behind an HTTPS proxy', async () => {
    const app = await buildSecuredApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/private?token=test-token',
      headers: { 'x-forwarded-proto': 'https' },
    });
    expect(String(res.headers['set-cookie'])).toContain('; Secure');
    await app.close();
  });

  it('falls back to the default rate limit when the configured max is NaN', async () => {
    const app = Fastify({ logger: false });
    await registerSecurity(app, { authToken: 't', rateLimitMax: Number('abc'), rateLimitWindow: '' });
    app.get('/api/private', async () => ({ ok: true }));
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/api/private', headers: { authorization: 'Bearer t' } });
    expect(res.statusCode).toBe(200);
    expect(res.headers['x-ratelimit-limit']).toBe('120');
    await app.close();
  });
});
