import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { CallSession } from '../services/session.js';
import { createDeepgramClient } from '../services/deepgram.js';
import { createHumeClient, type HumeHandle } from '../services/hume.js';
import { runLiveNudge } from '../services/claude.js';
import { buildSystemPrompt, buildUserPrompt } from '../prompts/live.js';
import { generateSummary } from '../services/summary.js';
import { generateScorecard } from '../services/scorecard.js';
import { queryProspectContext, storeCallMemory } from '../services/octamem.js';
import { postCallSummaryToSlack } from '../services/slack.js';
import { findOrCreateContact, writeCallEngagement } from '../services/hubspot.js';
import { fetchRecentSentEmails, refreshAccessToken, type SentEmail } from '../services/gmail.js';
import { fetchRecentOutlookSentEmails, refreshOutlookAccessToken } from '../services/outlook.js';
import {
  contacts,
  callSessions,
  transcriptLines,
  signalFrames,
  callSummaries,
  transcriptEmbeddings,
  type DB,
} from '../services/db.js';
import {
  embed,
  packFloat32,
  chunkTranscript,
  isPlaceholderVoyageKey,
} from '../services/embeddings.js';
import type { AIProvider } from '../services/ai.js';
import type {
  ClientMessage,
  ServerMessage,
  Prospect,
  SignalFrame,
  TranscriptLine,
  CallType,
  CallFramework,
  FaceSignals,
  PostCallSummary,
} from '@signal/types';

const CLAUDE_INTERVAL_MS = 12_000;
const MIN_NEW_LINES = 2;
/** Hard cap on in-memory transcript to prevent unbounded growth on long calls. */
const MAX_TRANSCRIPT_LINES = 5_000;
const VOICE_SAMPLE_TIMEOUT_MS = 3_000;
const MAX_SEARCH_INDEX_LINES = 20_000;

type CallState = 'IDLE' | 'STARTING' | 'ACTIVE' | 'STOPPING' | 'STOPPED';

const OptionalTextSchema = (max: number) =>
  z.preprocess(
    value => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().trim().max(max).optional(),
  );

const ProspectSchema = z.object({
  name: z.string().trim().min(1).max(200),
  company: OptionalTextSchema(200),
  email: OptionalTextSchema(320).pipe(z.string().email().max(320).optional()),
  linkedinUrl: OptionalTextSchema(500).pipe(z.string().url().max(500).optional()),
});

const ClientMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('start'),
    platform: z.enum(['meet', 'zoom', 'teams']),
    callType: z.enum(['investor', 'enterprise', 'bd', 'customer']),
    prospect: ProspectSchema,
  }),
  z.object({ type: z.literal('stop') }),
  z.object({
    type: z.literal('video_frame'),
    data: z.string().min(1),
  }),
]);

export interface WsRouteOptions {
  db: DB;
  ai: AIProvider;
  deepgramApiKey: string;
  deepgramModel?: string;
  humeApiKey: string;
  octamemApiKey: string;
  voyageApiKey: string;
  slackWebhookUrl: string;
  hubspotApiKey: string;
  liveModel: string;
  summaryModel: string;
  scoringFramework: CallFramework;
  publicBaseUrl?: string;
  maxMessageBytes?: number;
  gmail?: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
  };
  outlook?: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
    tenantId?: string;
  };
}

export function registerWsRoute(app: FastifyInstance, opts: WsRouteOptions): void {
  app.get('/ws', { websocket: true }, socket => {
    let session: CallSession | null = null;
    const sessionId = randomUUID();
    let contactId: string | null = null;
    let prospect: Prospect | null = null;
    let octamemContext: string | null = null;
    let previousOctamemId: string | null = null;
    let callType: CallType = 'enterprise';
    let platform: 'meet' | 'zoom' | 'teams' = 'meet';
    let startedAt = Date.now();
    let systemPrompt = '';
    let claudeTimer: NodeJS.Timeout | null = null;
    let sentimentSum = 0;
    let sentimentCount = 0;
    let latestFaceSignals: FaceSignals | undefined;
    const dangerMoments: Array<{ reason: string; timestamp: number }> = [];
    const collectedTranscript: TranscriptLine[] = [];
    let stopPromise: Promise<void> | null = null;
    let callState: CallState = 'IDLE';
    const maxMessageBytes = opts.maxMessageBytes ?? 1_048_576;

    function send(msg: ServerMessage): void {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(msg));
    }

    setImmediate(() => send({ type: 'connected', sessionId }));

    const dg = createDeepgramClient({
      apiKey: opts.deepgramApiKey,
      model: opts.deepgramModel ?? 'nova-3',
      onTranscript: line => {
        if (!session || callState !== 'ACTIVE') return;
        session.addLine(line);
        collectedTranscript.push(line);
        // Bound in-memory growth on long calls (DB has the full history)
        if (collectedTranscript.length > MAX_TRANSCRIPT_LINES) {
          collectedTranscript.splice(0, collectedTranscript.length - MAX_TRANSCRIPT_LINES);
        }
        try {
          opts.db
            .insert(transcriptLines)
            .values({
              sessionId,
              speaker: line.speaker,
              text: line.text,
              timestamp: line.timestamp,
            })
            .run();
        } catch (err) {
          console.error('[SIGNAL] failed to persist transcript line:', err);
        }
        send({ type: 'transcript', line });
        const danger = session.detectKeyword(line.text);
        if (danger) {
          dangerMoments.push({ reason: danger, timestamp: line.timestamp });
          send({ type: 'state', overlayState: 'DANGER' });
        }
      },
      onError: err => {
        console.error('[SIGNAL] Deepgram error:', err);
        send({ type: 'error', message: 'STT error' });
      },
    });

    const hume: HumeHandle = createHumeClient({
      apiKey: opts.humeApiKey,
      onFaceSignals: signals => {
        latestFaceSignals = signals;
      },
      onError: err => console.error('[SIGNAL] Hume error:', err),
    });

    async function onStart(msg: Extract<ClientMessage, { type: 'start' }>): Promise<void> {
      if (callState !== 'IDLE') {
        console.warn('[SIGNAL] onStart called in state', callState, '— ignoring');
        send({ type: 'error', message: 'Call session already started' });
        socket.close(1008, 'Call session already started');
        return;
      }
      callState = 'STARTING';
      platform = msg.platform;
      callType = msg.callType;
      prospect = msg.prospect;
      startedAt = Date.now();
      session = new CallSession(platform, callType);

      contactId = await upsertContact(opts.db, prospect);

      const row = opts.db.select().from(contacts).where(eq(contacts.id, contactId)).get();
      previousOctamemId = row?.octamemId ?? null;

      opts.db
        .insert(callSessions)
        .values({
          id: sessionId,
          contactId,
          platform,
          callType,
          startedAt,
        })
        .run();

      octamemContext = await queryProspectContext({
        apiKey: opts.octamemApiKey,
        prospect: { name: prospect.name, company: prospect.company },
        previousOctamemId: previousOctamemId ?? undefined,
      });

      systemPrompt = buildSystemPrompt(callType, octamemContext);
      callState = 'ACTIVE';
      send({ type: 'state', overlayState: 'LIVE' });

      // Guard rail: prevent overlapping Claude calls if one hangs past the 12s tick.
      let nudgeInFlight = false;
      claudeTimer = setInterval(async () => {
        if (!session || callState !== 'ACTIVE' || nudgeInFlight) return;
        if (session.newLinesSinceLastCall < MIN_NEW_LINES) return;
        const window = session.getWindow();
        session.resetNewLines();
        if (session.isSilent()) send({ type: 'state', overlayState: 'DANGER' });
        nudgeInFlight = true;
        const frame = await runLiveNudge({
          ai: opts.ai,
          model: opts.liveModel,
          systemPrompt,
          userPrompt: buildUserPrompt(window),
        })
          .catch(err => {
            console.error('[SIGNAL] runLiveNudge failed:', err);
            return null;
          })
          .finally(() => {
            nudgeInFlight = false;
          });
        if (frame) {
          // Attach latest Hume face signals if available
          const enrichedFrame: SignalFrame = latestFaceSignals
            ? { ...frame, faceSignals: latestFaceSignals }
            : frame;
          try {
            persistFrame(opts.db, sessionId, enrichedFrame);
          } catch (err) {
            console.error('[SIGNAL] failed to persist frame:', err);
          }
          sentimentSum += enrichedFrame.sentiment;
          sentimentCount += 1;
          send({ type: 'frame', frame: enrichedFrame });
          send({ type: 'state', overlayState: enrichedFrame.dangerFlag ? 'DANGER' : 'LIVE' });
        }
      }, CLAUDE_INTERVAL_MS);
    }

    function onStop(): Promise<void> {
      if (stopPromise) return stopPromise;
      stopPromise = _onStop();
      return stopPromise;
    }

    async function _onStop(): Promise<void> {
      if (callState === 'STOPPED') return;
      callState = 'STOPPING';
      if (claudeTimer) {
        clearInterval(claudeTimer);
        claudeTimer = null;
      }
      dg.finish();
      hume.close();

      const endedAt = Date.now();
      const durationMs = endedAt - startedAt;
      const sentimentAvg = sentimentCount > 0 ? sentimentSum / sentimentCount : null;

      // Only update call_sessions if a start row was inserted
      if (session && prospect && contactId) {
        const persistedTranscript = loadTranscriptForSession(opts.db, sessionId);
        const analysisTranscript =
          persistedTranscript.length > 0 ? persistedTranscript : [...collectedTranscript];
        const talk = computeTalkRatio(analysisTranscript);
        try {
          opts.db
            .update(callSessions)
            .set({
              endedAt,
              durationMs,
              sentimentAvg,
              userWords: talk.userWords,
              prospectWords: talk.prospectWords,
              talkRatio: talk.talkRatio,
              longestMonologueMs: talk.longestMonologueMs,
            })
            .where(eq(callSessions.id, sessionId))
            .run();
        } catch (err) {
          console.error('[SIGNAL] failed to update call session:', err);
        }

        const voiceSamples = await loadVoiceSamples({ gmail: opts.gmail, outlook: opts.outlook });
        const summary = await generateSummary({
          ai: opts.ai,
          model: opts.summaryModel,
          callType,
          transcript: analysisTranscript,
          voiceSamples: voiceSamples ?? undefined,
        }).catch(err => {
          console.error('[SIGNAL] generateSummary failed:', err);
          return null;
        });

        if (summary) {
          persistSummary(opts.db, sessionId, summary, endedAt);
          send({ type: 'summary', summary });
        } else {
          send({
            type: 'summary_unavailable',
            message: 'No summary was generated for this call.',
          });
        }
        send({ type: 'state', overlayState: 'POSTCALL' });

        void runDeferredPostCallJobs(summary, analysisTranscript, {
          contactId,
          durationMs,
          endedAt,
          sentimentAvg,
        });
      } else {
        send({
          type: 'summary_unavailable',
          message: 'The call ended before a session was started.',
        });
        send({ type: 'state', overlayState: 'POSTCALL' });
      }
      callState = 'STOPPED';
    }

    async function runDeferredPostCallJobs(
      summary: PostCallSummary | null,
      transcript: TranscriptLine[],
      meta: {
        contactId: string;
        durationMs: number;
        endedAt: number;
        sentimentAvg: number | null;
      },
    ): Promise<void> {
      if (summary && prospect) {
        try {
          const scorecard = await generateScorecard({
            ai: opts.ai,
            model: opts.summaryModel,
            framework: opts.scoringFramework,
            callType,
            transcript,
          });
          if (scorecard) {
            try {
              opts.db
                .update(callSummaries)
                .set({ scorecard: JSON.stringify(scorecard) })
                .where(eq(callSummaries.sessionId, sessionId))
                .run();
            } catch (err) {
              console.error('[SIGNAL] failed to persist scorecard:', err);
            }
            send({ type: 'scorecard', scorecard });
          }
        } catch (err) {
          console.error('[SIGNAL] generateScorecard failed:', err);
        }

        try {
          const newMemId = await storeCallMemory({
            apiKey: opts.octamemApiKey,
            contact: { name: prospect.name, company: prospect.company },
            callType,
            durationMs: meta.durationMs,
            sentimentAvg: meta.sentimentAvg ?? 0,
            summary,
            dangerMoments,
            previousOctamemId: previousOctamemId ?? undefined,
          });
          if (newMemId) {
            opts.db
              .update(contacts)
              .set({ octamemId: newMemId, updatedAt: meta.endedAt })
              .where(eq(contacts.id, meta.contactId))
              .run();
          }
        } catch (err) {
          console.error('[SIGNAL] failed to store call memory:', err);
        }

        // HubSpot — ensure contact exists then log the call. Graceful no-op on placeholder / errors.
        try {
          const existing = opts.db
            .select()
            .from(contacts)
            .where(eq(contacts.id, meta.contactId))
            .get();
          let hubspotContactId = existing?.hubspotId ?? null;
          if (!hubspotContactId) {
            const created = await findOrCreateContact({
              apiKey: opts.hubspotApiKey,
              prospect: { name: prospect.name, email: prospect.email, company: prospect.company },
            });
            if (created) {
              hubspotContactId = created.hubspotId;
              try {
                opts.db
                  .update(contacts)
                  .set({ hubspotId: hubspotContactId, updatedAt: meta.endedAt })
                  .where(eq(contacts.id, meta.contactId))
                  .run();
              } catch (err) {
                console.error('[SIGNAL] failed to persist hubspot id:', err);
              }
            }
          }
          if (hubspotContactId) {
            await writeCallEngagement({
              apiKey: opts.hubspotApiKey,
              hubspotContactId,
              summary,
              durationMs: meta.durationMs,
              sentimentAvg: meta.sentimentAvg,
              startedAt,
            });
          }
        } catch (err) {
          console.error('[SIGNAL] HubSpot sync failed:', err);
        }

        // Slack — post summary to the configured webhook. Graceful no-op on placeholder.
        try {
          const callUrl = opts.publicBaseUrl
            ? `${opts.publicBaseUrl.replace(/\/$/, '')}/dashboard/#/calls/${sessionId}`
            : undefined;
          await postCallSummaryToSlack({
            webhookUrl: opts.slackWebhookUrl,
            contact: { name: prospect.name, company: prospect.company },
            summary,
            callUrl,
            durationMs: meta.durationMs,
            sentimentAvg: meta.sentimentAvg,
          });
        } catch (err) {
          console.error('[SIGNAL] Slack post failed:', err);
        }
      }

      // Index transcript for semantic search. Best-effort and intentionally
      // deferred so stop-capture remains responsive.
      if (!isPlaceholderVoyageKey(opts.voyageApiKey)) {
        try {
          const chunks = chunkTranscript(transcript.slice(-MAX_SEARCH_INDEX_LINES));
          if (chunks.length > 0) {
            const vectors = await embed(
              chunks.map(c => c.text),
              opts.voyageApiKey,
            );
            if (vectors && vectors.length === chunks.length) {
              for (let i = 0; i < chunks.length; i++) {
                opts.db
                  .insert(transcriptEmbeddings)
                  .values({
                    sessionId,
                    chunkIndex: chunks[i].index,
                    speaker: chunks[i].speaker,
                    text: chunks[i].text,
                    embedding: packFloat32(vectors[i]),
                  })
                  .onConflictDoNothing()
                  .run();
              }
            }
          }
        } catch (err) {
          console.error('[SIGNAL] transcript embedding indexing failed:', err);
        }
      }
    }

    socket.on('message', rawData => {
      const data = Buffer.isBuffer(rawData) ? rawData : Buffer.from(rawData as ArrayBuffer);
      if (data.byteLength > maxMessageBytes) {
        send({ type: 'error', message: 'Message too large' });
        socket.close(1009, 'Message too large');
        return;
      }
      let rawMessage: unknown;
      try {
        rawMessage = JSON.parse(data.toString());
      } catch {
        // Binary = audio chunk → forward to Deepgram
        dg.send(data);
        return;
      }

      const parsed = ClientMessageSchema.safeParse(rawMessage);
      if (!parsed.success) {
        send({ type: 'error', message: 'Invalid WebSocket message' });
        socket.close(1008, 'Invalid WebSocket message');
        return;
      }

      const msg = parsed.data;
      if (msg.type === 'start') {
        onStart(msg).catch(err => {
          console.error('[SIGNAL] onStart failed:', err);
          send({ type: 'error', message: 'Failed to start session' });
          socket.close(1011, 'Failed to start session');
        });
        return;
      }
      if (msg.type === 'stop') {
        onStop().catch(err => console.error('[SIGNAL] onStop failed:', err));
        return;
      }
      if (msg.type === 'video_frame') {
        hume.sendFrame(msg.data);
      }
    });

    socket.on('close', () => {
      onStop().catch(err => console.error('[SIGNAL] onStop (close) failed:', err));
    });
    socket.on('error', err => {
      console.error('[SIGNAL] WS socket error:', err);
      onStop().catch(e => console.error('[SIGNAL] onStop (error) failed:', e));
    });
  });
}

async function upsertContact(db: DB, prospect: Prospect): Promise<string> {
  const now = Date.now();
  const name = prospect.name.trim();
  const company = cleanOptional(prospect.company);
  const email = cleanOptional(prospect.email);
  const linkedinUrl = cleanOptional(prospect.linkedinUrl);
  const emailKey = email?.toLowerCase();
  let existing = emailKey
    ? db
        .select()
        .from(contacts)
        .where(sql`lower(${contacts.email}) = ${emailKey}`)
        .get()
    : undefined;
  existing ??= company
    ? db
        .select()
        .from(contacts)
        .where(
          sql`lower(${contacts.name}) = ${name.toLowerCase()} AND lower(${contacts.company}) = ${company.toLowerCase()}`,
        )
        .get()
    : db
        .select()
        .from(contacts)
        .where(and(sql`lower(${contacts.name}) = ${name.toLowerCase()}`, isNull(contacts.company)))
        .get();
  if (existing) {
    db.update(contacts)
      .set({
        email: email ?? existing.email,
        linkedinUrl: linkedinUrl ?? existing.linkedinUrl,
        company: company ?? existing.company,
        updatedAt: now,
      })
      .where(eq(contacts.id, existing.id))
      .run();
    return existing.id;
  }
  const id = randomUUID();
  db.insert(contacts)
    .values({
      id,
      name,
      email,
      linkedinUrl,
      company,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return id;
}

function cleanOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

interface TalkRatioStats {
  userWords: number;
  prospectWords: number;
  talkRatio: number | null;
  longestMonologueMs: number | null;
}

function countWords(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  return t.split(/\s+/).length;
}

function computeTalkRatio(lines: TranscriptLine[]): TalkRatioStats {
  let userWords = 0;
  let prospectWords = 0;
  for (const l of lines) {
    const n = countWords(l.text);
    if (l.speaker === 'user') userWords += n;
    else if (l.speaker === 'prospect') prospectWords += n;
  }
  const total = userWords + prospectWords;
  const talkRatio = total > 0 ? userWords / total : null;

  // Longest monologue: consecutive run of same-speaker lines, measured as
  // (last line timestamp - first line timestamp) within the run.
  let longestMonologueMs: number | null = null;
  let runSpeaker: string | null = null;
  let runStart = 0;
  let runEnd = 0;
  for (const l of lines) {
    if (l.speaker !== runSpeaker) {
      if (runSpeaker !== null) {
        const delta = runEnd - runStart;
        if (longestMonologueMs === null || delta > longestMonologueMs) longestMonologueMs = delta;
      }
      runSpeaker = l.speaker;
      runStart = l.timestamp;
      runEnd = l.timestamp;
    } else {
      runEnd = l.timestamp;
    }
  }
  if (runSpeaker !== null) {
    const delta = runEnd - runStart;
    if (longestMonologueMs === null || delta > longestMonologueMs) longestMonologueMs = delta;
  }

  return { userWords, prospectWords, talkRatio, longestMonologueMs };
}

function loadTranscriptForSession(db: DB, sessionId: string): TranscriptLine[] {
  try {
    return db
      .select({
        speaker: transcriptLines.speaker,
        text: transcriptLines.text,
        timestamp: transcriptLines.timestamp,
      })
      .from(transcriptLines)
      .where(eq(transcriptLines.sessionId, sessionId))
      .orderBy(transcriptLines.timestamp)
      .all() as TranscriptLine[];
  } catch (err) {
    console.error('[SIGNAL] failed to load persisted transcript:', err);
    return [];
  }
}

function persistSummary(
  db: DB,
  sessionId: string,
  summary: PostCallSummary,
  createdAt: number,
): void {
  try {
    db.insert(callSummaries)
      .values({
        id: randomUUID(),
        sessionId,
        winSignals: JSON.stringify(summary.winSignals),
        objections: JSON.stringify(summary.objections),
        decisions: JSON.stringify(summary.decisions),
        followUpDraft: summary.followUpDraft,
        createdAt,
      })
      .onConflictDoNothing()
      .run();
  } catch (err) {
    console.error('[SIGNAL] failed to persist summary:', err);
  }
}

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
  fallback: T,
): Promise<T> {
  let timer: NodeJS.Timeout | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>(resolve => {
        timer = setTimeout(() => {
          console.warn(`[SIGNAL] ${label} timed out after ${ms}ms`);
          resolve(fallback);
        }, ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function loadGmailVoiceSamples(gmail: WsRouteOptions['gmail']): Promise<SentEmail[]> {
  if (!gmail?.clientId || !gmail.clientSecret || !gmail.refreshToken) return [];
  const accessToken = await refreshAccessToken({
    clientId: gmail.clientId,
    clientSecret: gmail.clientSecret,
    refreshToken: gmail.refreshToken,
  });
  if (!accessToken) return [];
  return (await fetchRecentSentEmails({ accessToken, limit: 8 })) ?? [];
}

async function loadOutlookVoiceSamples(outlook: WsRouteOptions['outlook']): Promise<SentEmail[]> {
  if (!outlook?.clientId || !outlook.clientSecret || !outlook.refreshToken) return [];
  const accessToken = await refreshOutlookAccessToken({
    clientId: outlook.clientId,
    clientSecret: outlook.clientSecret,
    refreshToken: outlook.refreshToken,
    tenantId: outlook.tenantId,
  });
  if (!accessToken) return [];
  return (await fetchRecentOutlookSentEmails({ accessToken, limit: 8 })) ?? [];
}

async function loadVoiceSamples(providers: {
  gmail?: WsRouteOptions['gmail'];
  outlook?: WsRouteOptions['outlook'];
}): Promise<Array<{ subject: string; body: string }> | null> {
  return withTimeout(
    loadVoiceSamplesUnsafe(providers),
    VOICE_SAMPLE_TIMEOUT_MS,
    'voice sample loading',
    null,
  );
}

async function loadVoiceSamplesUnsafe(providers: {
  gmail?: WsRouteOptions['gmail'];
  outlook?: WsRouteOptions['outlook'];
}): Promise<Array<{ subject: string; body: string }> | null> {
  const [gmailSamples, outlookSamples] = await Promise.all([
    loadGmailVoiceSamples(providers.gmail).catch(err => {
      console.error('[SIGNAL] Gmail voice samples failed:', err);
      return [] as SentEmail[];
    }),
    loadOutlookVoiceSamples(providers.outlook).catch(err => {
      console.error('[SIGNAL] Outlook voice samples failed:', err);
      return [] as SentEmail[];
    }),
  ]);
  const samples = [...gmailSamples, ...outlookSamples]
    .filter(sample => sample.body.trim())
    .sort((a, b) => b.sentAt - a.sentAt)
    .slice(0, 8)
    .map(({ subject, body }) => ({ subject, body }));
  return samples.length > 0 ? samples : null;
}

function persistFrame(db: DB, sessionId: string, frame: SignalFrame): void {
  db.insert(signalFrames)
    .values({
      sessionId,
      promptType: frame.prompt.type,
      promptText: frame.prompt.text,
      confidence: frame.prompt.confidence,
      sentiment: frame.sentiment,
      dangerFlag: frame.dangerFlag ? 1 : 0,
      createdAt: Date.now(),
    })
    .run();
}
