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
});
