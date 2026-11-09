import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServerMessage } from '@signal/types';
import { createCaptureSession, httpBaseFromWsUrl, SOCKET_OPEN, type SocketLike } from './captureSession';

class FakeSocket implements SocketLike {
  readyState = 0;
  sent: Array<string | ArrayBuffer> = [];
  closed = false;
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;
  constructor(public url: string) {}
  send(data: string | ArrayBuffer) { this.sent.push(data); }
  close() { this.closed = true; this.readyState = 3; }
  open() { this.readyState = SOCKET_OPEN; this.onopen?.({}); }
  receive(msg: ServerMessage) { this.onmessage?.({ data: JSON.stringify(msg) }); }
  drop() { this.readyState = 3; this.onclose?.({}); }
  sentTypes() { return this.sent.filter((d): d is string => typeof d === 'string').map(d => JSON.parse(d).type); }
}

const summary = { winSignals: [], objections: [], decisions: [], followUpDraft: 'hi' };

function setup(overrides: { summaryTimeoutMs?: number } = {}) {
  const sockets: FakeSocket[] = [];
  const stopMedia = vi.fn();
  const startMedia = vi.fn(() => stopMedia);
  const onServerMessage = vi.fn();
  const onEnded = vi.fn();
  const session = createCaptureSession({
    url: 'ws://x/ws',
    startMessage: { type: 'start', platform: 'meet', callType: 'bd', prospect: { name: 'Ada' } },
    createSocket: (url) => { const s = new FakeSocket(url); sockets.push(s); return s; },
    startMedia,
    onServerMessage,
    onEnded,
    reconnectDelays: [1000, 2000, 4000],
    maxReconnectAttempts: 3,
    ...overrides,
  });
  return { session, sockets, startMedia, stopMedia, onServerMessage, onEnded };
}

describe('createCaptureSession', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('sends start and begins streaming once the socket opens', () => {
    const { sockets, startMedia } = setup();
    expect(startMedia).not.toHaveBeenCalled();
    sockets[0].open();
    expect(sockets[0].sentTypes()).toEqual(['start']);
    expect(startMedia).toHaveBeenCalledWith(sockets[0]);
  });

  it('keeps the socket open after stop until the post-call summary arrives', () => {
    const { session, sockets, stopMedia, onServerMessage, onEnded } = setup();
    sockets[0].open();
    session.stop();
    expect(sockets[0].sentTypes()).toEqual(['start', 'stop']);
    expect(stopMedia).toHaveBeenCalledOnce();
    expect(sockets[0].closed).toBe(false);
    expect(onEnded).not.toHaveBeenCalled();

    sockets[0].receive({ type: 'summary', summary });
    expect(onServerMessage).toHaveBeenCalledWith({ type: 'summary', summary });
    expect(sockets[0].closed).toBe(true);
    expect(onEnded).toHaveBeenCalledWith('stopped');
  });

  it('closes after a timeout if the summary never arrives', () => {
    const { session, sockets, onEnded } = setup({ summaryTimeoutMs: 5000 });
    sockets[0].open();
    session.stop();
    vi.advanceTimersByTime(4999);
    expect(sockets[0].closed).toBe(false);
    vi.advanceTimersByTime(1);
    expect(sockets[0].closed).toBe(true);
    expect(onEnded).toHaveBeenCalledOnce();
  });

  it('does not reconnect when the server closes after stop', () => {
    const { session, sockets, onEnded } = setup();
    sockets[0].open();
    session.stop();
    sockets[0].drop();
    vi.advanceTimersByTime(10_000);
    expect(sockets).toHaveLength(1);
    expect(onEnded).toHaveBeenCalledWith('stopped');
  });

  it('reconnects with backoff and resets the attempt budget after a successful reconnect', () => {
    const { sockets, stopMedia, startMedia } = setup();
    sockets[0].open();
    sockets[0].drop();
    expect(stopMedia).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(999);
    expect(sockets).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(sockets).toHaveLength(2);
    sockets[1].open();
    expect(startMedia).toHaveBeenCalledTimes(2);
    expect(sockets[1].sentTypes()).toEqual(['start']);

    // Budget was reset by the successful open — first delay applies again.
    sockets[1].drop();
    vi.advanceTimersByTime(1000);
    expect(sockets).toHaveLength(3);
  });

  it('gives up after max attempts, stops media and reports connection loss', () => {
    const { sockets, onEnded } = setup();
    sockets[0].open();
    sockets[0].drop();
    vi.advanceTimersByTime(1000); sockets[1].drop();
    vi.advanceTimersByTime(2000); sockets[2].drop();
    vi.advanceTimersByTime(4000); sockets[3].drop();
    vi.advanceTimersByTime(60_000);
    expect(sockets).toHaveLength(4);
    expect(onEnded).toHaveBeenCalledOnce();
    expect(onEnded).toHaveBeenCalledWith('connection-lost');
  });

  it('stop during a reconnect wait cancels the pending reconnect', () => {
    const { session, sockets, onEnded } = setup();
    sockets[0].open();
    sockets[0].drop();
    session.stop();
    vi.advanceTimersByTime(10_000);
    expect(sockets).toHaveLength(1);
    expect(onEnded).toHaveBeenCalledWith('stopped');
  });

  it('stop before the socket opens never starts media and does not send', () => {
    const { session, sockets, startMedia, onEnded } = setup();
    session.stop();
    sockets[0].open();
    expect(startMedia).not.toHaveBeenCalled();
    expect(sockets[0].sent).toEqual([]);
    expect(sockets[0].closed).toBe(true);
    expect(onEnded).toHaveBeenCalledOnce();
  });

  it('ignores events from a superseded socket', () => {
    const { sockets, onServerMessage } = setup();
    sockets[0].open();
    const stale = sockets[0];
    stale.drop();
    vi.advanceTimersByTime(1000);
    stale.receive({ type: 'error', message: 'late' });
    expect(onServerMessage).not.toHaveBeenCalled();
  });

  it('ignores malformed server payloads', () => {
    const { sockets, onServerMessage } = setup();
    sockets[0].open();
    sockets[0].onmessage?.({ data: 'not json' });
    expect(onServerMessage).not.toHaveBeenCalled();
  });
});

describe('httpBaseFromWsUrl', () => {
  it('maps ws and wss to http and https', () => {
    expect(httpBaseFromWsUrl('ws://localhost:8080')).toBe('http://localhost:8080');
    expect(httpBaseFromWsUrl('wss://signal.example.com/')).toBe('https://signal.example.com');
  });
});
