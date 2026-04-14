import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import websocketPlugin from '@fastify/websocket';
import WebSocket from 'ws';

// Mock services
vi.mock('../services/deepgram.js', () => ({
  createDeepgramClient: vi.fn(() => ({
    send: vi.fn(),
    finish: vi.fn(),
  })),
}));

vi.mock('../services/claude.js', () => ({
  callClaude: vi.fn().mockResolvedValue(null),
}));

vi.mock('../services/session.js', () => ({
  CallSession: vi.fn().mockImplementation(() => ({
    id: 'test-session-id',
    addLine: vi.fn(),
    getWindow: vi.fn(() => []),
    newLinesSinceLastCall: 0,
    resetNewLines: vi.fn(),
    isSilent: vi.fn(() => false),
    detectKeyword: vi.fn(() => null),
    setCompetitors: vi.fn(),
    callType: 'enterprise',
  })),
}));

import { registerWsRoute } from './ws.js';

async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(websocketPlugin);
  registerWsRoute(app, {
    anthropicApiKey: 'sk-ant-your-key-here',
    deepgramApiKey: 'your-deepgram-key-here',
  });
  await app.ready();
  return app;
}

describe('WebSocket route', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let address: string;

  beforeEach(async () => {
    app = await buildApp();
    const listenAddress = await app.listen({ port: 0 });
    const port = new URL(listenAddress).port;
    address = `ws://localhost:${port}/ws`;
  });

  afterEach(async () => {
    await app.close();
  });

  it('sends connected message on connect', async () => {
    const ws = new WebSocket(address);
    const msg = await new Promise<string>((resolve) => {
      ws.on('message', (data) => resolve(data.toString()));
    });
    ws.close();
    const parsed = JSON.parse(msg);
    expect(parsed.type).toBe('connected');
    expect(typeof parsed.sessionId).toBe('string');
  });

  it('handles binary audio chunk without crashing', async () => {
    const ws = new WebSocket(address);
    await new Promise<void>((resolve) => ws.on('open', resolve));
    await new Promise<void>((resolve) => ws.once('message', () => resolve()));
    ws.send(Buffer.from([0x01, 0x02, 0x03]));
    await new Promise(r => setTimeout(r, 50));
    expect(ws.readyState).toBe(WebSocket.OPEN);
    ws.close();
  });

  it('handles stop message', async () => {
    const ws = new WebSocket(address);
    await new Promise<void>((resolve) => ws.on('open', resolve));
    await new Promise<void>((resolve) => ws.once('message', () => resolve()));
    ws.send(JSON.stringify({ type: 'stop' }));
    await new Promise(r => setTimeout(r, 50));
    ws.close();
  });
});
