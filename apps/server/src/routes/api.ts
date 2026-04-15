import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { desc, eq, sql } from 'drizzle-orm';
import {
  contacts, callSessions, transcriptLines, signalFrames, callSummaries, type DB,
} from '../services/db.js';
import { queryProspectContext } from '../services/octamem.js';

export interface ApiRouteOptions { db: DB; octamemApiKey: string; }

function safeParseArray(json: string): string[] {
  try { return JSON.parse(json) as string[]; } catch { return []; }
}

export function registerApiRoutes(app: FastifyInstance, opts: ApiRouteOptions): void {
  const { db, octamemApiKey } = opts;

  // ── Contacts ───────────────────────────────────────────────────────

  app.get('/api/contacts', async () => db.select().from(contacts).all());

  app.post('/api/contacts', async (req, reply) => {
    const body = req.body as Partial<typeof contacts.$inferInsert>;
    if (!body.name) return reply.code(400).send({ error: 'name required' });
    const now = Date.now();
    const id = randomUUID();
    const row = {
      id, name: body.name, email: body.email, linkedinUrl: body.linkedinUrl,
      company: body.company, role: body.role, notes: body.notes,
      createdAt: now, updatedAt: now,
    };
    db.insert(contacts).values(row).run();
    return reply.code(201).send(row);
  });

  app.get('/api/contacts/:id', async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const row = db.select().from(contacts).where(eq(contacts.id, id)).get();
    if (!row) return reply.code(404).send({ error: 'not found' });
    return row;
  });

  app.put('/api/contacts/:id', async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const existing = db.select().from(contacts).where(eq(contacts.id, id)).get();
    if (!existing) return reply.code(404).send({ error: 'not found' });
    const body = req.body as Partial<typeof contacts.$inferInsert>;
    const patch = { ...existing, ...body, id, updatedAt: Date.now() };
    db.update(contacts).set(patch).where(eq(contacts.id, id)).run();
    return patch;
  });

  app.delete('/api/contacts/:id', async (req, reply) => {
    const id = (req.params as { id: string }).id;
    db.delete(contacts).where(eq(contacts.id, id)).run();
    return reply.code(204).send();
  });

  // ── Calls ──────────────────────────────────────────────────────────

  app.get('/api/calls', async () =>
    db.select().from(callSessions).orderBy(desc(callSessions.startedAt)).all(),
  );

  app.get('/api/calls/:id', async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const row = db.select().from(callSessions).where(eq(callSessions.id, id)).get();
    if (!row) return reply.code(404).send({ error: 'not found' });
    return row;
  });

  app.get('/api/calls/:id/transcript', async (req) => {
    const id = (req.params as { id: string }).id;
    return db.select().from(transcriptLines).where(eq(transcriptLines.sessionId, id)).all();
  });

  app.get('/api/calls/:id/frames', async (req) => {
    const id = (req.params as { id: string }).id;
    return db.select().from(signalFrames).where(eq(signalFrames.sessionId, id)).all();
  });

  app.get('/api/calls/:id/summary', async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const row = db.select().from(callSummaries).where(eq(callSummaries.sessionId, id)).get();
    if (!row) return reply.code(404).send({ error: 'not found' });
    return {
      ...row,
      winSignals: safeParseArray(row.winSignals),
      objections: safeParseArray(row.objections),
      decisions: safeParseArray(row.decisions),
    };
  });

  // ── OctaMem ────────────────────────────────────────────────────────

  // Popup helper: query OctaMem via server (extension can't hold the key)
  app.post('/api/octamem/query', async (req) => {
    const { prospect } = req.body as { prospect: { name: string; company?: string } };
    const context = await queryProspectContext({ apiKey: octamemApiKey, prospect });
    return { context };
  });

  // ── Analytics ──────────────────────────────────────────────────────

  app.get('/api/analytics/sentiment', async () => {
    return db.select({
      week: sql<string>`strftime('%Y-%W', started_at / 1000, 'unixepoch')`,
      avg: sql<number>`AVG(sentiment_avg)`,
      count: sql<number>`COUNT(*)`,
    }).from(callSessions).where(sql`sentiment_avg IS NOT NULL`)
      .groupBy(sql`strftime('%Y-%W', started_at / 1000, 'unixepoch')`).all();
  });

  app.get('/api/analytics/prompt-types', async () => {
    return db.select({
      promptType: signalFrames.promptType,
      count: sql<number>`COUNT(*)`,
    }).from(signalFrames).groupBy(signalFrames.promptType).all();
  });

  app.get('/api/analytics/objections', async () => {
    const rows = db.select().from(callSummaries).all();
    const counts = new Map<string, number>();
    for (const r of rows) {
      const list = safeParseArray(r.objections);
      for (const o of list) counts.set(o, (counts.get(o) ?? 0) + 1);
    }
    return [...counts.entries()].map(([objection, count]) => ({ objection, count }))
      .sort((a, b) => b.count - a.count);
  });

  // ── Contact-scoped aggregates ──────────────────────────────────────

  app.get('/api/contacts/:id/objections', async (req) => {
    const id = (req.params as { id: string }).id;
    const sessions = db.select({ id: callSessions.id })
      .from(callSessions).where(eq(callSessions.contactId, id)).all();
    const sessionIds = new Set(sessions.map(s => s.id));
    const summaries = db.select().from(callSummaries).all()
      .filter(s => sessionIds.has(s.sessionId));
    const counts = new Map<string, number>();
    for (const s of summaries) {
      const list = safeParseArray(s.objections);
      for (const o of list) counts.set(o, (counts.get(o) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([objection, count]) => ({ objection, count }))
      .sort((a, b) => b.count - a.count);
  });
}
