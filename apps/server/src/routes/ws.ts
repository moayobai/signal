import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { CallSession } from '../services/session.js';
import { createDeepgramClient } from '../services/deepgram.js';
import { runLiveNudge } from '../services/claude.js';
import { buildSystemPrompt, buildUserPrompt } from '../prompts/live.js';
import { generateSummary } from '../services/summary.js';
import { queryProspectContext, storeCallMemory } from '../services/octamem.js';
import { contacts, callSessions, transcriptLines, signalFrames, callSummaries, type DB } from '../services/db.js';
import type { AIProvider } from '../services/ai.js';
import type { ClientMessage, ServerMessage, Prospect, SignalFrame, TranscriptLine, CallType } from '@signal/types';

const CLAUDE_INTERVAL_MS = 12_000;
const MIN_NEW_LINES = 2;

export interface WsRouteOptions {
  db: DB;
  ai: AIProvider;
  deepgramApiKey: string;
  octamemApiKey: string;
  liveModel: string;
  summaryModel: string;
}

export function registerWsRoute(app: FastifyInstance, opts: WsRouteOptions): void {
  app.get('/ws', { websocket: true }, (socket) => {
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
    const dangerMoments: Array<{ reason: string; timestamp: number }> = [];
    const collectedTranscript: TranscriptLine[] = [];
    let ended = false;

    function send(msg: ServerMessage): void {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(msg));
    }

    setImmediate(() => send({ type: 'connected', sessionId }));

    const dg = createDeepgramClient({
      apiKey: opts.deepgramApiKey,
      onTranscript: (line) => {
        if (!session) return;
        session.addLine(line);
        collectedTranscript.push(line);
        opts.db.insert(transcriptLines).values({
          sessionId, speaker: line.speaker, text: line.text, timestamp: line.timestamp,
        }).run();
        send({ type: 'transcript', line });
        const danger = session.detectKeyword(line.text);
        if (danger) {
          dangerMoments.push({ reason: danger, timestamp: line.timestamp });
          send({ type: 'state', overlayState: 'DANGER' });
        }
      },
      onError: (err) => {
        console.error('[SIGNAL] Deepgram error:', err);
        send({ type: 'error', message: 'STT error' });
      },
    });

    async function onStart(msg: Extract<ClientMessage, { type: 'start' }>): Promise<void> {
      platform = msg.platform;
      callType = msg.callType;
      prospect = msg.prospect;
      startedAt = Date.now();
      session = new CallSession(platform, callType);

      contactId = await upsertContact(opts.db, prospect);

      const row = opts.db.select().from(contacts).where(eq(contacts.id, contactId)).get();
      previousOctamemId = row?.octamemId ?? null;

      opts.db.insert(callSessions).values({
        id: sessionId, contactId, platform, callType, startedAt,
      }).run();

      octamemContext = await queryProspectContext({
        apiKey: opts.octamemApiKey,
        prospect: { name: prospect.name, company: prospect.company },
        previousOctamemId: previousOctamemId ?? undefined,
      });

      systemPrompt = buildSystemPrompt(callType, octamemContext);
      send({ type: 'state', overlayState: 'LIVE' });

      claudeTimer = setInterval(async () => {
        if (!session) return;
        if (session.newLinesSinceLastCall < MIN_NEW_LINES) return;
        const window = session.getWindow();
        session.resetNewLines();
        if (session.isSilent()) send({ type: 'state', overlayState: 'DANGER' });
        const frame = await runLiveNudge({
          ai: opts.ai,
          model: opts.liveModel,
          systemPrompt,
          userPrompt: buildUserPrompt(window),
        });
        if (frame) {
          persistFrame(opts.db, sessionId, frame);
          sentimentSum += frame.sentiment;
          sentimentCount += 1;
          send({ type: 'frame', frame });
          send({ type: 'state', overlayState: frame.dangerFlag ? 'DANGER' : 'LIVE' });
        }
      }, CLAUDE_INTERVAL_MS);
    }

    async function onStop(): Promise<void> {
      if (ended) return;
      ended = true;
      if (claudeTimer) { clearInterval(claudeTimer); claudeTimer = null; }
      dg.finish();

      const endedAt = Date.now();
      const durationMs = endedAt - startedAt;
      const sentimentAvg = sentimentCount > 0 ? sentimentSum / sentimentCount : 0;

      // Only update call_sessions if a start row was inserted
      if (session && prospect && contactId) {
        opts.db.update(callSessions).set({
          endedAt, durationMs, sentimentAvg,
        }).where(eq(callSessions.id, sessionId)).run();

        const summary = await generateSummary({
          ai: opts.ai,
          model: opts.summaryModel,
          callType,
          transcript: collectedTranscript,
        });

        if (summary) {
          opts.db.insert(callSummaries).values({
            id: randomUUID(),
            sessionId,
            winSignals: JSON.stringify(summary.winSignals),
            objections: JSON.stringify(summary.objections),
            decisions: JSON.stringify(summary.decisions),
            followUpDraft: summary.followUpDraft,
            createdAt: endedAt,
          }).run();

          const newMemId = await storeCallMemory({
            apiKey: opts.octamemApiKey,
            contact: { name: prospect.name, company: prospect.company },
            callType, durationMs, sentimentAvg,
            summary, dangerMoments,
            previousOctamemId: previousOctamemId ?? undefined,
          });
          if (newMemId) {
            opts.db.update(contacts).set({ octamemId: newMemId, updatedAt: endedAt })
              .where(eq(contacts.id, contactId)).run();
          }

          send({ type: 'summary', summary });
          send({ type: 'state', overlayState: 'POSTCALL' });
        }
      }
    }

    socket.on('message', (rawData) => {
      const data = Buffer.isBuffer(rawData) ? rawData : Buffer.from(rawData as ArrayBuffer);
      try {
        const msg = JSON.parse(data.toString()) as ClientMessage;
        if (msg.type === 'start') { void onStart(msg); return; }
        if (msg.type === 'stop') { void onStop(); return; }
      } catch {
        dg.send(data);
      }
    });

    socket.on('close', () => { void onStop(); });
    socket.on('error', (err) => {
      console.error('[SIGNAL] WS socket error:', err);
      void onStop();
    });
  });
}

async function upsertContact(db: DB, prospect: Prospect): Promise<string> {
  const now = Date.now();
  const existing = db.select().from(contacts).where(
    prospect.company
      ? and(eq(contacts.name, prospect.name), eq(contacts.company, prospect.company))
      : eq(contacts.name, prospect.name),
  ).get();
  if (existing) {
    db.update(contacts).set({
      email: prospect.email ?? existing.email,
      linkedinUrl: prospect.linkedinUrl ?? existing.linkedinUrl,
      company: prospect.company ?? existing.company,
      updatedAt: now,
    }).where(eq(contacts.id, existing.id)).run();
    return existing.id;
  }
  const id = randomUUID();
  db.insert(contacts).values({
    id, name: prospect.name, email: prospect.email, linkedinUrl: prospect.linkedinUrl,
    company: prospect.company, createdAt: now, updatedAt: now,
  }).run();
  return id;
}

function persistFrame(db: DB, sessionId: string, frame: SignalFrame): void {
  db.insert(signalFrames).values({
    sessionId,
    promptType: frame.prompt.type,
    promptText: frame.prompt.text,
    confidence: frame.prompt.confidence,
    sentiment: frame.sentiment,
    dangerFlag: frame.dangerFlag ? 1 : 0,
    createdAt: Date.now(),
  }).run();
}
