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
      method: 'POST',
      url: '/api/contacts',
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
      method: 'PUT',
      url: '/api/contacts/c1',
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

  it('GET /api/analytics/coach returns a coaching focus from scored calls', async () => {
    const { app, db } = await buildApp();
    const { contacts, callSessions, callSummaries, signalFrames } =
      await import('../services/db.js');
    const now = Date.now();
    db.insert(contacts)
      .values({ id: 'c1', name: 'Maya', company: 'Northstar', createdAt: now, updatedAt: now })
      .run();
    db.insert(callSessions)
      .values({
        id: 's1',
        contactId: 'c1',
        platform: 'meet',
        callType: 'investor',
        startedAt: now,
        endedAt: now + 1000,
        durationMs: 1000,
        sentimentAvg: 72,
        talkRatio: 0.71,
        longestMonologueMs: 44_000,
      })
      .run();
    db.insert(callSummaries)
      .values({
        id: 'sum1',
        sessionId: 's1',
        winSignals: JSON.stringify(['Budget owner engaged']),
        objections: JSON.stringify(['Needs proof around security']),
        decisions: JSON.stringify(['Send diligence pack']),
        followUpDraft: 'Follow-up',
        scorecard: JSON.stringify({
          framework: 'BANT',
          overallScore: 64,
          dimensions: [{ key: 'authority', label: 'Authority', score: 4, justification: 'Weak' }],
          nextSteps: ['Confirm authority'],
        }),
        createdAt: now,
      })
      .run();
    db.insert(signalFrames)
      .values({
        sessionId: 's1',
        promptType: 'ASK',
        promptText: 'Ask for timeline.',
        confidence: 0.8,
        sentiment: 72,
        dangerFlag: 0,
        createdAt: now,
      })
      .run();

    const res = await app.inject({ method: 'GET', url: '/api/analytics/coach' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.windowSize).toBe(1);
    expect(body.focus.title).toBe('Talk time discipline');
    expect(body.averages.score).toBe(64);
    expect(body.topObjection.objection).toBe('Needs proof around security');
    expect(body.topPromptType.promptType).toBe('ASK');
    await app.close();
  });
});
