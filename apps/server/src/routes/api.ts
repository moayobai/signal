import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  contacts,
  callSessions,
  transcriptLines,
  signalFrames,
  callSummaries,
  transcriptEmbeddings,
  upcomingMeetings,
  type DB,
} from '../services/db.js';
import type { CalendarAttendee } from '../services/calendar.js';
import { queryProspectContext } from '../services/octamem.js';
import {
  embed,
  cosineSimilarity,
  unpackFloat32,
  isPlaceholderVoyageKey,
} from '../services/embeddings.js';

export interface ApiRouteOptions {
  db: DB;
  octamemApiKey: string;
  voyageApiKey: string;
}

function safeParseArray(json: string): string[] {
  try {
    return JSON.parse(json) as string[];
  } catch {
    return [];
  }
}

function safeParseJson<T>(json: string | null): T | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

// ── Request body schemas ─────────────────────────────────────────────
const ContactCreateSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().max(320).optional(),
  linkedinUrl: z.string().url().max(500).optional(),
  company: z.string().max(200).optional(),
  role: z.string().max(200).optional(),
  notes: z.string().max(5000).optional(),
});
const ContactUpdateSchema = ContactCreateSchema.partial();
const OctaMemQuerySchema = z.object({
  prospect: z.object({
    name: z.string().min(1).max(200),
    company: z.string().max(200).optional(),
  }),
});
const SearchTranscriptsSchema = z.object({
  query: z.string().min(1).max(200),
  limit: z.number().int().min(1).max(50).optional(),
});

export function registerApiRoutes(app: FastifyInstance, opts: ApiRouteOptions): void {
  const { db, octamemApiKey, voyageApiKey } = opts;

  // ── Contacts ───────────────────────────────────────────────────────

  app.get('/api/contacts', async () => db.select().from(contacts).all());

  app.post('/api/contacts', async (req, reply) => {
    const parsed = ContactCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid body', details: parsed.error.issues });
    }
    const body = parsed.data;
    const now = Date.now();
    const id = randomUUID();
    const row = {
      id,
      name: body.name,
      email: body.email,
      linkedinUrl: body.linkedinUrl,
      company: body.company,
      role: body.role,
      notes: body.notes,
      createdAt: now,
      updatedAt: now,
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
    if (!existing) return reply.code(404).send({ error: 'Contact not found' });
    const parsed = ContactUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid body', details: parsed.error.issues });
    }
    const patch = { ...existing, ...parsed.data, id, updatedAt: Date.now() };
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

  app.get('/api/calls/:id/transcript', async req => {
    const id = (req.params as { id: string }).id;
    return db.select().from(transcriptLines).where(eq(transcriptLines.sessionId, id)).all();
  });

  app.get('/api/calls/:id/frames', async req => {
    const id = (req.params as { id: string }).id;
    const rows = db
      .select()
      .from(signalFrames)
      .where(eq(signalFrames.sessionId, id))
      .orderBy(signalFrames.createdAt)
      .all();
    // Add `timestamp` alias and relative offset from call start for UI
    const call = db.select().from(callSessions).where(eq(callSessions.id, id)).get();
    const startedAt = call?.startedAt ?? rows[0]?.createdAt ?? 0;
    return rows.map(r => ({
      ...r,
      timestamp: r.createdAt,
      offsetMs: Math.max(0, r.createdAt - startedAt),
    }));
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
      scorecard: safeParseJson(row.scorecard),
    };
  });

  // ── OctaMem ────────────────────────────────────────────────────────

  // Popup helper: query OctaMem via server (extension can't hold the key)
  app.post('/api/octamem/query', async (req, reply) => {
    const parsed = OctaMemQuerySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid body', details: parsed.error.issues });
    }
    const context = await queryProspectContext({
      apiKey: octamemApiKey,
      prospect: parsed.data.prospect,
    });
    return { context };
  });

  // ── Analytics ──────────────────────────────────────────────────────

  app.get('/api/analytics/sentiment', async () => {
    return db
      .select({
        week: sql<string>`strftime('%Y-%W', started_at / 1000, 'unixepoch')`,
        avg: sql<number>`AVG(sentiment_avg)`,
        count: sql<number>`COUNT(*)`,
      })
      .from(callSessions)
      .where(sql`sentiment_avg IS NOT NULL`)
      .groupBy(sql`strftime('%Y-%W', started_at / 1000, 'unixepoch')`)
      .all();
  });

  app.get('/api/analytics/prompt-types', async () => {
    return db
      .select({
        promptType: signalFrames.promptType,
        count: sql<number>`COUNT(*)`,
      })
      .from(signalFrames)
      .groupBy(signalFrames.promptType)
      .all();
  });

  app.get('/api/analytics/objections', async () => {
    const rows = db.select().from(callSummaries).all();
    const counts = new Map<string, number>();
    for (const r of rows) {
      const list = safeParseArray(r.objections);
      for (const o of list) counts.set(o, (counts.get(o) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([objection, count]) => ({ objection, count }))
      .sort((a, b) => b.count - a.count);
  });

  // ── Semantic transcript search ─────────────────────────────────────

  app.post('/api/search/transcripts', async (req, reply) => {
    if (isPlaceholderVoyageKey(voyageApiKey)) {
      return reply.code(503).send({ error: 'Semantic search requires VOYAGE_API_KEY' });
    }
    const parsed = SearchTranscriptsSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid body', details: parsed.error.issues });
    }
    const { query } = parsed.data;
    const limit = parsed.data.limit ?? 10;

    const embedded = await embed([query], voyageApiKey);
    if (!embedded || embedded.length === 0) {
      return reply.code(502).send({ error: 'Failed to embed query' });
    }
    const qVec = embedded[0];

    // Load all chunk embeddings — fine for <10k calls; swap for sqlite-vss later.
    const rows = db.select().from(transcriptEmbeddings).all();
    const scored = rows.map(r => ({
      sessionId: r.sessionId,
      chunkIndex: r.chunkIndex,
      speaker: r.speaker,
      text: r.text,
      similarity: cosineSimilarity(qVec, unpackFloat32(r.embedding as Buffer)),
    }));
    scored.sort((a, b) => b.similarity - a.similarity);
    const top = scored.slice(0, limit);

    // Enrich with contact + call metadata.
    const sessionIds = [...new Set(top.map(t => t.sessionId))];
    const sessions =
      sessionIds.length > 0
        ? db.select().from(callSessions).where(inArray(callSessions.id, sessionIds)).all()
        : [];
    const sessionById = new Map(sessions.map(s => [s.id, s]));
    const contactIds = [...new Set(sessions.map(s => s.contactId).filter((x): x is string => !!x))];
    const contactRows =
      contactIds.length > 0
        ? db.select().from(contacts).where(inArray(contacts.id, contactIds)).all()
        : [];
    const contactById = new Map(contactRows.map(c => [c.id, c]));

    return top.map(t => {
      const session = sessionById.get(t.sessionId);
      const contact = session?.contactId ? contactById.get(session.contactId) : undefined;
      return {
        sessionId: t.sessionId,
        chunkIndex: t.chunkIndex,
        speaker: t.speaker,
        text: t.text,
        similarity: t.similarity,
        contactId: contact?.id ?? null,
        contactName: contact?.name ?? null,
        contactCompany: contact?.company ?? null,
        calledAt: session?.startedAt ?? null,
      };
    });
  });

  // ── Calendar / upcoming meetings ───────────────────────────────────

  function hydrateMeeting(row: typeof upcomingMeetings.$inferSelect) {
    return {
      id: row.id,
      provider: row.provider,
      title: row.title,
      startTime: row.startTime,
      endTime: row.endTime,
      attendees: safeParseJson<CalendarAttendee[]>(row.attendees) ?? [],
      meetingLink: row.meetingLink,
      description: row.description,
      detectedAt: row.detectedAt,
    };
  }

  app.get('/api/calendar/next', async () => {
    const now = Date.now();
    const HORIZON_MS = 15 * 60 * 1000; // match poller window
    const row = db
      .select()
      .from(upcomingMeetings)
      .where(
        sql`${upcomingMeetings.startTime} > ${now} AND ${upcomingMeetings.startTime} <= ${now + HORIZON_MS}`,
      )
      .orderBy(asc(upcomingMeetings.startTime))
      .limit(1)
      .get();
    return row ? hydrateMeeting(row) : null;
  });

  app.get('/api/calendar/upcoming', async () => {
    const now = Date.now();
    const HORIZON_MS = 60 * 60 * 1000; // next 1 hour
    const rows = db
      .select()
      .from(upcomingMeetings)
      .where(
        sql`${upcomingMeetings.startTime} > ${now} AND ${upcomingMeetings.startTime} <= ${now + HORIZON_MS}`,
      )
      .orderBy(asc(upcomingMeetings.startTime))
      .all();
    return rows.map(hydrateMeeting);
  });

  // ── Contact-scoped aggregates ──────────────────────────────────────

  app.get('/api/contacts/:id/objections', async req => {
    const id = (req.params as { id: string }).id;
    const sessions = db
      .select({ id: callSessions.id })
      .from(callSessions)
      .where(eq(callSessions.contactId, id))
      .all();
    const sessionIds = sessions.map(s => s.id);
    if (sessionIds.length === 0) return [];
    // Single indexed query (previously loaded all summaries then filtered in-memory)
    const summaries = db
      .select()
      .from(callSummaries)
      .where(inArray(callSummaries.sessionId, sessionIds))
      .all();
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
