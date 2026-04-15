import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import websocketPlugin from '@fastify/websocket';
import WebSocket from 'ws';

vi.mock('../services/deepgram.js', () => ({
  createDeepgramClient: vi.fn(() => ({ send: vi.fn(), finish: vi.fn() })),
}));
vi.mock('../services/octamem.js', () => ({
  queryProspectContext: vi.fn().mockResolvedValue(null),
  storeCallMemory: vi.fn().mockResolvedValue(null),
}));
vi.mock('../services/summary.js', () => ({
  generateSummary: vi.fn().mockResolvedValue(null),
}));

import { registerWsRoute } from './ws.js';
import { initDb } from '../services/db.js';
import { NoOpProvider } from '../services/ai.js';

async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(websocketPlugin);
  registerWsRoute(app, {
    db: initDb(':memory:'),
    ai: new NoOpProvider(),
    deepgramApiKey: 'your-deepgram-key-here',
    octamemApiKey: 'your-octamem-key-here',
    liveModel: 'claude-haiku-4-5-20251001',
    summaryModel: 'claude-sonnet-4-6',
  });
  await app.ready();
  return app;
}

function connectAndDrainConnected(address: string): Promise<WebSocket> {
  return new Promise((resolve) => {
    const ws = new WebSocket(address);
    ws.once('message', () => resolve(ws));
  });
}

describe('WebSocket route', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let address: string;

  beforeEach(async () => {
    app = await buildApp();
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
});
