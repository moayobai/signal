import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { registerApiRoutes } from './api.js';
import { initDb } from '../services/db.js';

async function buildApp() {
  const app = Fastify({ logger: false });
  const db = initDb(':memory:');
  registerApiRoutes(app, { db, octamemApiKey: '', voyageApiKey: '' });
  await app.ready();
  return { app, db };
}

describe('REST API', () => {
  it('GET /api/contacts empty', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/contacts' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
    await app.close();
  });

  it('POST /api/contacts creates a contact', async () => {
    const { app } = await buildApp();
    const res = await app.inject({
      method: 'POST', url: '/api/contacts',
      payload: { name: 'James', company: 'Acme' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.id).toBeDefined();
    expect(body.name).toBe('James');
    await app.close();
  });

  it('GET /api/contacts/:id returns 404 for unknown', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/contacts/missing' });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('GET /api/calls returns empty when no sessions', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/calls' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
    await app.close();
  });

  it('PUT /api/contacts/:id updates a contact', async () => {
    const { app, db } = await buildApp();
    const { contacts } = await import('../services/db.js');
    const now = Date.now();
    db.insert(contacts).values({ id: 'c1', name: 'James', createdAt: now, updatedAt: now }).run();
    const res = await app.inject({
      method: 'PUT', url: '/api/contacts/c1',
      payload: { company: 'Acme Updated', notes: 'Great contact' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().company).toBe('Acme Updated');
    await app.close();
  });

  it('GET /api/analytics/sentiment returns array when no calls', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/analytics/sentiment' });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json())).toBe(true);
    await app.close();
  });
});

describe('REST API — regressions', () => {
  it('tolerates non-array objections JSON in stored summaries', async () => {
    const { app, db } = await buildApp();
    const { callSessions, callSummaries } = await import('../services/db.js');
    db.insert(callSessions).values({ id: 's1', platform: 'meet', callType: 'enterprise', startedAt: 1 }).run();
    db.insert(callSummaries).values({
      id: 'sum1', sessionId: 's1', winSignals: 'null', objections: '{"a":1}',
      decisions: '["ok", 3]', followUpDraft: '', createdAt: 1,
    }).run();
    const analytics = await app.inject({ method: 'GET', url: '/api/analytics/objections' });
    expect(analytics.statusCode).toBe(200);
    expect(analytics.json()).toEqual([]);
    const summary = await app.inject({ method: 'GET', url: '/api/calls/s1/summary' });
    expect(summary.statusCode).toBe(200);
    expect(summary.json().winSignals).toEqual([]);
    expect(summary.json().decisions).toEqual(['ok']);
    await app.close();
  });

  it('returns transcript lines in chronological order', async () => {
    const { app, db } = await buildApp();
    const { callSessions, transcriptLines } = await import('../services/db.js');
    db.insert(callSessions).values({ id: 's1', platform: 'meet', callType: 'enterprise', startedAt: 1 }).run();
    db.insert(transcriptLines).values({ sessionId: 's1', speaker: 'user', text: 'second', timestamp: 20 }).run();
    db.insert(transcriptLines).values({ sessionId: 's1', speaker: 'user', text: 'first', timestamp: 10 }).run();
    const res = await app.inject({ method: 'GET', url: '/api/calls/s1/transcript' });
    expect(res.json().map((l: { text: string }) => l.text)).toEqual(['first', 'second']);
    await app.close();
  });

  it('returns [] attendees when stored attendees JSON is not an array', async () => {
    const { app, db } = await buildApp();
    const { upcomingMeetings } = await import('../services/db.js');
    db.insert(upcomingMeetings).values({
      id: 'google:1', provider: 'google', title: 'Sync', startTime: Date.now() + 60_000,
      endTime: Date.now() + 120_000, attendees: '{}', detectedAt: Date.now(),
    }).run();
    const res = await app.inject({ method: 'GET', url: '/api/calendar/next' });
    expect(res.json().attendees).toEqual([]);
    await app.close();
  });
});
