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

  it('sets an auth cookie when the query token is valid', async () => {
    const app = await buildSecuredApp();
    const res = await app.inject({ method: 'GET', url: '/api/private?token=test-token' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['set-cookie']).toContain('signal_auth=');
    await app.close();
  });

  it('redirects dashboard token URLs after setting the auth cookie', async () => {
    const app = await buildSecuredApp();
    const res = await app.inject({ method: 'GET', url: '/dashboard/?token=test-token&tab=calls' });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/dashboard/?tab=calls');
    expect(res.headers['set-cookie']).toContain('signal_auth=');
    await app.close();
  });

  it('sets secure cookies when production cookie mode is enabled', async () => {
    const app = Fastify({ logger: false });
    await registerSecurity(app, {
      authToken: 'test-token',
      secureCookies: true,
    });
    app.get('/api/private', async () => ({ ok: true }));
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/api/private?token=test-token' });
    expect(res.headers['set-cookie']).toContain('Secure');
    await app.close();
  });

  it('rate limits repeated requests', async () => {
    const app = await buildSecuredApp();
    const headers = { authorization: 'Bearer test-token' };
    expect((await app.inject({ method: 'GET', url: '/api/private', headers })).statusCode).toBe(
      200,
    );
    expect((await app.inject({ method: 'GET', url: '/api/private', headers })).statusCode).toBe(
      200,
    );
    expect((await app.inject({ method: 'GET', url: '/api/private', headers })).statusCode).toBe(
      429,
    );
    await app.close();
  });
});
