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
const ListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(10_000).optional(),
  offset: z.coerce.number().int().min(0).max(100_000).optional(),
});

const DEFAULT_LIST_LIMIT = 500;
const MAX_TRANSCRIPT_LIMIT = 10_000;
const MAX_FRAME_LIMIT = 5_000;
const MAX_SEARCH_CHUNKS = 25_000;
const COACH_WINDOW_LIMIT = 500;

function listQuery(req: { query: unknown }, defaultLimit = DEFAULT_LIST_LIMIT) {
  const parsed = ListQuerySchema.safeParse(req.query ?? {});
  if (!parsed.success) return { limit: defaultLimit, offset: 0 };
  return {
    limit: parsed.data.limit ?? defaultLimit,
    offset: parsed.data.offset ?? 0,
  };
}

interface ParsedScorecard {
  framework?: string;
  overallScore?: number;
  dimensions?: Array<{ key?: string; label?: string; score?: number; justification?: string }>;
  nextSteps?: string[];
}

function average(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((sum, n) => sum + n, 0) / nums.length;
}

function rounded(n: number | null): number | null {
  return n == null || !Number.isFinite(n) ? null : Math.round(n);
}

function pct(n: number | null): number | null {
  return n == null || !Number.isFinite(n) ? null : Math.round(n * 100);
}

function firstNonEmpty(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

export function registerApiRoutes(app: FastifyInstance, opts: ApiRouteOptions): void {
  const { db, octamemApiKey, voyageApiKey } = opts;

  // ── Contacts ───────────────────────────────────────────────────────

  app.get('/api/contacts', async req => {
    const { limit, offset } = listQuery(req);
    return db.select().from(contacts).orderBy(asc(contacts.name)).limit(limit).offset(offset).all();
  });

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

  app.get('/api/calls', async req => {
    const { limit, offset } = listQuery(req);
    return db
      .select()
      .from(callSessions)
      .orderBy(desc(callSessions.startedAt))
      .limit(limit)
      .offset(offset)
      .all();
  });

  app.get('/api/calls/:id', async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const row = db.select().from(callSessions).where(eq(callSessions.id, id)).get();
    if (!row) return reply.code(404).send({ error: 'not found' });
    return row;
  });

  app.get('/api/calls/:id/transcript', async req => {
    const id = (req.params as { id: string }).id;
    const { limit, offset } = listQuery(req, MAX_TRANSCRIPT_LIMIT);
    return db
      .select()
      .from(transcriptLines)
      .where(eq(transcriptLines.sessionId, id))
      .orderBy(transcriptLines.timestamp)
      .limit(Math.min(limit, MAX_TRANSCRIPT_LIMIT))
      .offset(offset)
      .all();
  });

  app.get('/api/calls/:id/frames', async req => {
    const id = (req.params as { id: string }).id;
    const { limit, offset } = listQuery(req, MAX_FRAME_LIMIT);
    const rows = db
      .select()
      .from(signalFrames)
      .where(eq(signalFrames.sessionId, id))
      .orderBy(signalFrames.createdAt)
      .limit(Math.min(limit, MAX_FRAME_LIMIT))
      .offset(offset)
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

  app.get('/api/analytics/coach', async () => {
    const recentCalls = db
      .select()
      .from(callSessions)
      .orderBy(desc(callSessions.startedAt))
      .limit(COACH_WINDOW_LIMIT)
      .all();
    const sessionIds = recentCalls.map(c => c.id);
    const summaries =
      sessionIds.length > 0
        ? db.select().from(callSummaries).where(inArray(callSummaries.sessionId, sessionIds)).all()
        : [];
    const summaryBySession = new Map(summaries.map(s => [s.sessionId, s]));

    const scorecards = recentCalls
      .map(call => safeParseJson<ParsedScorecard>(summaryBySession.get(call.id)?.scorecard ?? null))
      .filter(
        (scorecard): scorecard is ParsedScorecard =>
          !!scorecard && typeof scorecard.overallScore === 'number',
      );
    const scoreValues = scorecards.map(s => s.overallScore!).filter(Number.isFinite);
    const recentScore = average(scoreValues.slice(0, 5));
    const priorScore = average(scoreValues.slice(5, 10));
    const sentimentValues = recentCalls
      .map(c => c.sentimentAvg)
      .filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
    const recentSentiment = average(sentimentValues.slice(0, 5));
    const priorSentiment = average(sentimentValues.slice(5, 10));
    const talkValues = recentCalls
      .map(c => c.talkRatio)
      .filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
    const avgTalkRatio = average(talkValues);
    const longestMonologueMs = recentCalls
      .map(c => c.longestMonologueMs)
      .filter((n): n is number => typeof n === 'number' && Number.isFinite(n));

    const objectionCounts = new Map<string, number>();
    const promptCounts = new Map<string, number>();
    const dimensionScores = new Map<string, { label: string; total: number; count: number }>();
    const callTypeCounts = new Map<string, number>();
    for (const call of recentCalls) {
      callTypeCounts.set(call.callType, (callTypeCounts.get(call.callType) ?? 0) + 1);
      const summary = summaryBySession.get(call.id);
      if (summary) {
        for (const objection of safeParseArray(summary.objections)) {
          objectionCounts.set(objection, (objectionCounts.get(objection) ?? 0) + 1);
        }
      }
    }
    const frameRows =
      sessionIds.length > 0
        ? db
            .select({ promptType: signalFrames.promptType, count: sql<number>`COUNT(*)` })
            .from(signalFrames)
            .where(inArray(signalFrames.sessionId, sessionIds))
            .groupBy(signalFrames.promptType)
            .all()
        : [];
    for (const row of frameRows) promptCounts.set(row.promptType, row.count);

    for (const scorecard of scorecards) {
      for (const dim of scorecard.dimensions ?? []) {
        if (typeof dim.score !== 'number' || !Number.isFinite(dim.score)) continue;
        const key = dim.key ?? dim.label ?? 'unknown';
        const existing = dimensionScores.get(key) ?? {
          label: dim.label ?? key,
          total: 0,
          count: 0,
        };
        existing.total += dim.score;
        existing.count += 1;
        dimensionScores.set(key, existing);
      }
    }

    const weakestDimension = [...dimensionScores.entries()]
      .map(([key, value]) => ({
        key,
        label: value.label,
        score: value.count > 0 ? Math.round((value.total / value.count) * 10) / 10 : null,
      }))
      .filter(d => d.score != null)
      .sort((a, b) => (a.score ?? 0) - (b.score ?? 0))[0];
    const topObjection = [...objectionCounts.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;
    const topPrompt = [...promptCounts.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;

    const talkPct = pct(avgTalkRatio);
    const focus =
      talkPct != null && talkPct > 55
        ? {
            title: 'Talk time discipline',
            metric: `${talkPct}%`,
            rationale: 'Your talk ratio is above the buyer-led target.',
            action: 'Open with one sharper question, then leave the next answer uninterrupted.',
          }
        : weakestDimension
          ? {
              title: weakestDimension.label,
              metric: `${weakestDimension.score}/10`,
              rationale: 'This is the lowest methodology signal across scored calls.',
              action: `Make ${weakestDimension.label.toLowerCase()} explicit before the next close.`,
            }
          : topObjection
            ? {
                title: 'Recurring objection',
                metric: `${topObjection[1]}x`,
                rationale: topObjection[0],
                action: 'Prepare a proof point and a question that turns this into criteria.',
              }
            : {
                title: 'First compounding loop',
                metric: `${recentCalls.length}`,
                rationale: 'Complete more calls to establish a coaching baseline.',
                action: 'Run the next call through SIGNAL and review the post-call scorecard.',
              };

    return {
      windowSize: recentCalls.length,
      averages: {
        sentiment: rounded(average(sentimentValues)),
        sentimentDelta:
          recentSentiment != null && priorSentiment != null
            ? Math.round(recentSentiment - priorSentiment)
            : null,
        score: rounded(average(scoreValues)),
        scoreDelta:
          recentScore != null && priorScore != null ? Math.round(recentScore - priorScore) : null,
        talkRatio: talkPct,
        longestMonologueSec: rounded(average(longestMonologueMs.map(ms => ms / 1000))),
      },
      focus,
      topObjection: topObjection ? { objection: topObjection[0], count: topObjection[1] } : null,
      topPromptType: topPrompt ? { promptType: topPrompt[0], count: topPrompt[1] } : null,
      weakestDimension: weakestDimension ?? null,
      callTypeMix: [...callTypeCounts.entries()]
        .map(([callType, count]) => ({ callType, count }))
        .sort((a, b) => b.count - a.count),
      loop: [
        {
          label: 'Capture',
          value: recentCalls.length,
          detail: `${summaries.length} debriefs saved`,
        },
        {
          label: 'Coach',
          value: scoreValues.length,
          detail: firstNonEmpty(weakestDimension?.label, topPrompt?.[0], 'Awaiting scorecards'),
        },
        {
          label: 'Compound',
          value: objectionCounts.size,
          detail: firstNonEmpty(topObjection?.[0], 'No recurring objection yet'),
        },
      ],
    };
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
    const rows = db.select().from(transcriptEmbeddings).limit(MAX_SEARCH_CHUNKS).all();
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
