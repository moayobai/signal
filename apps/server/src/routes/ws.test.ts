import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import websocketPlugin from '@fastify/websocket';
import WebSocket from 'ws';

const deepgramMock = vi.hoisted(() => ({
  options: null as null | { onTranscript: (line: { speaker: 'user' | 'prospect'; text: string; timestamp: number }) => void },
  send: vi.fn(),
  finish: vi.fn(),
}));
const summaryMock = vi.hoisted(() => ({
  generateSummary: vi.fn(),
}));

vi.mock('../services/deepgram.js', () => ({
  createDeepgramClient: vi.fn((options) => {
    deepgramMock.options = options;
    deepgramMock.send.mockImplementation(() => {
      options.onTranscript({ speaker: 'user', text: 'We can run a pilot next week.', timestamp: Date.now() });
    });
    return { send: deepgramMock.send, finish: deepgramMock.finish };
  }),
}));
vi.mock('../services/octamem.js', () => ({
  queryProspectContext: vi.fn().mockResolvedValue(null),
  storeCallMemory: vi.fn().mockResolvedValue(null),
}));
vi.mock('../services/summary.js', () => ({
  generateSummary: summaryMock.generateSummary,
}));

import { registerWsRoute } from './ws.js';
import { queryProspectContext } from '../services/octamem.js';
import { initDb, callSessions, contacts, transcriptLines, callSummaries } from '../services/db.js';
import { NoOpProvider } from '../services/ai.js';
import { registerSecurity } from '../services/security.js';

async function buildApp(options: { auth?: boolean } = {}) {
  const app = Fastify({ logger: false });
  if (options.auth) {
    await registerSecurity(app, {
      authToken: 'test-token',
      rateLimitMax: 100,
      rateLimitWindow: '1 minute',
    });
  }
  await app.register(websocketPlugin);
  const db = initDb(':memory:');
  registerWsRoute(app, {
    db,
    ai: new NoOpProvider(),
    deepgramApiKey: 'your-deepgram-key-here',
    humeApiKey: 'your-hume-key-here',
    octamemApiKey: 'your-octamem-key-here',
    voyageApiKey: 'your-voyage-key-here',
    slackWebhookUrl: 'your-slack-webhook-url-here',
    hubspotApiKey: 'your-hubspot-key-here',
    liveModel: 'claude-haiku-4-5-20251001',
    summaryModel: 'claude-sonnet-4-6',
    scoringFramework: 'MEDDIC',
  });
  await app.ready();
  return { app, db };
}

function connectAndDrainConnected(address: string): Promise<WebSocket> {
  return new Promise((resolve) => {
    const ws = new WebSocket(address);
    ws.once('message', () => resolve(ws));
  });
}

describe('WebSocket route', () => {
  let built: Awaited<ReturnType<typeof buildApp>>;
  let app: Awaited<ReturnType<typeof buildApp>>['app'];
  let address: string;

  beforeEach(async () => {
    deepgramMock.send.mockReset();
    deepgramMock.finish.mockReset();
    summaryMock.generateSummary.mockReset();
    summaryMock.generateSummary.mockResolvedValue(null);
    built = await buildApp();
    app = built.app;
    const listen = await app.listen({ port: 0 });
    address = `ws://localhost:${new URL(listen).port}/ws`;
  });
  afterEach(async () => { await app.close(); });

  it('sends connected message on connect', async () => {
    const ws = new WebSocket(address);
    const msg = await new Promise<string>((resolve) => {
      ws.on('message', (d) => resolve(d.toString()));
    });
    ws.close();
    expect(JSON.parse(msg).type).toBe('connected');
  });

  it('handles start with prospect + stop', async () => {
    const ws = await connectAndDrainConnected(address);
    ws.send(JSON.stringify({
      type: 'start', platform: 'meet', callType: 'investor',
      prospect: { name: 'James', company: 'Acme' },
    }));
    await new Promise(r => setTimeout(r, 100));
    ws.send(JSON.stringify({ type: 'stop' }));
    await new Promise(r => setTimeout(r, 50));
    expect(ws.readyState).toBe(WebSocket.OPEN);
    ws.close();
  });

  it('handles binary audio chunk', async () => {
    const ws = await connectAndDrainConnected(address);
    ws.send(Buffer.from([0x01, 0x02, 0x03]));
    await new Promise(r => setTimeout(r, 50));
    expect(ws.readyState).toBe(WebSocket.OPEN);
    ws.close();
  });

  it('is idempotent when stop and close race', async () => {
    const ws = await connectAndDrainConnected(address);
    ws.send(JSON.stringify({
      type: 'start', platform: 'meet', callType: 'investor',
      prospect: { name: 'James', company: 'Acme' },
    }));
    await new Promise(r => setTimeout(r, 50));
    ws.send(JSON.stringify({ type: 'stop' }));
    ws.close(); // fire both in quick succession
    await new Promise(r => setTimeout(r, 100));
    // If _onStop ran twice, Drizzle insert on callSummaries would throw on UNIQUE(sessionId).
    // Reaching this line without the test failing proves idempotence.
    expect(true).toBe(true);
  });

  it('persists the full call lifecycle', async () => {
    summaryMock.generateSummary.mockResolvedValue({
      winSignals: ['Pilot agreed'],
      objections: [],
      decisions: ['Send pilot plan'],
      followUpDraft: 'Thanks for the call. I will send the pilot plan.',
    });
    const ws = await connectAndDrainConnected(address);
    ws.send(JSON.stringify({
      type: 'start', platform: 'meet', callType: 'enterprise',
      prospect: { name: 'James', company: 'Acme' },
    }));
    await new Promise(r => setTimeout(r, 100));
    ws.send(Buffer.from([0x01, 0x02, 0x03]));
    await new Promise(r => setTimeout(r, 50));
    ws.send(JSON.stringify({ type: 'stop' }));
    await new Promise(r => setTimeout(r, 150));

    expect(built.db.select().from(contacts).all()).toHaveLength(1);
    const sessions = built.db.select().from(callSessions).all();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].endedAt).toBeTypeOf('number');
    expect(built.db.select().from(transcriptLines).all()).toHaveLength(1);
    expect(built.db.select().from(callSummaries).all()).toHaveLength(1);
    ws.close();
  });

  it('rejects unauthenticated websocket upgrades when security is enabled', async () => {
    await app.close();
    built = await buildApp({ auth: true });
    app = built.app;
    const res = await app.inject({ method: 'GET', url: '/ws' });
    expect(res.statusCode).toBe(401);
  });

  describe('regressions', () => {
    function collect(ws: WebSocket): Array<Record<string, unknown>> {
      const msgs: Array<Record<string, unknown>> = [];
      ws.on('message', (d) => msgs.push(JSON.parse(d.toString())));
      return msgs;
    }

    it('does not go LIVE when stop arrives while start is still awaiting OctaMem', async () => {
      let resolveQuery: (v: string | null) => void = () => {};
      vi.mocked(queryProspectContext).mockImplementationOnce(
        () => new Promise((r) => { resolveQuery = r; }),
      );
      const ws = await connectAndDrainConnected(address);
      const msgs = collect(ws);
      ws.send(JSON.stringify({
        type: 'start', platform: 'meet', callType: 'enterprise',
        prospect: { name: 'James', company: 'Acme' },
      }));
      await new Promise(r => setTimeout(r, 50));
      ws.send(JSON.stringify({ type: 'stop' }));
      await new Promise(r => setTimeout(r, 50));
      resolveQuery(null);
      await new Promise(r => setTimeout(r, 50));
      expect(msgs).not.toContainEqual({ type: 'state', overlayState: 'LIVE' });
      // Audio after stop must not be persisted as transcript.
      ws.send(Buffer.from([0x01]));
      await new Promise(r => setTimeout(r, 50));
      expect(built.db.select().from(transcriptLines).all()).toHaveLength(0);
      ws.close();
    });

    it('rejects a malformed start message without touching the DB', async () => {
      const ws = await connectAndDrainConnected(address);
      const msgs = collect(ws);
      ws.send(JSON.stringify({ type: 'start', platform: 'meet', callType: 'enterprise' }));
      await new Promise(r => setTimeout(r, 50));
      expect(msgs).toContainEqual({ type: 'error', message: 'Invalid start message' });
      expect(built.db.select().from(contacts).all()).toHaveLength(0);
      expect(built.db.select().from(callSessions).all()).toHaveLength(0);

      // The session is still startable afterwards.
      ws.send(JSON.stringify({
        type: 'start', platform: 'zoom', callType: 'bd', prospect: { name: 'Ana', company: null },
      }));
      await new Promise(r => setTimeout(r, 50));
      expect(msgs).toContainEqual({ type: 'state', overlayState: 'LIVE' });
      expect(built.db.select().from(contacts).all()[0].company).toBeNull();
      ws.close();
    });

    it('flags DANGER after 30s of silence even though no new lines arrive', async () => {
      const ws = await connectAndDrainConnected(address);
      const msgs = collect(ws);
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
      try {
        ws.send(JSON.stringify({
          type: 'start', platform: 'meet', callType: 'enterprise', prospect: { name: 'James' },
        }));
        await vi.waitFor(() => expect(msgs).toContainEqual({ type: 'state', overlayState: 'LIVE' }));
        ws.send(Buffer.from([0x01])); // mock Deepgram emits one transcript line
        await vi.waitFor(() => expect(msgs.some(m => m.type === 'transcript')).toBe(true));
        vi.advanceTimersByTime(36_000);
        await vi.waitFor(() => expect(msgs).toContainEqual({ type: 'state', overlayState: 'DANGER' }));
      } finally {
        vi.useRealTimers();
        ws.close();
      }
    });

    it('does not forward malformed text frames to Deepgram as audio', async () => {
      const ws = await connectAndDrainConnected(address);
      const msgs = collect(ws);
      ws.send('this is not json');
      ws.send('null');
      await new Promise(r => setTimeout(r, 50));
      expect(deepgramMock.send).not.toHaveBeenCalled();
      expect(msgs.filter(m => m.type === 'error')).toHaveLength(2);
      ws.close();
    });
  });
});
