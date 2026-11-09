import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const sdkMock = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => void>();
  return {
    handlers,
    connection: {
      on: vi.fn((event: string, cb: (...args: unknown[]) => void) => { handlers.set(event, cb); }),
      send: vi.fn(),
      keepAlive: vi.fn(),
      requestClose: vi.fn(),
      finish: vi.fn(),
    },
  };
});

vi.mock('@deepgram/sdk', () => ({
  createClient: vi.fn(() => ({ listen: { live: vi.fn(() => sdkMock.connection) } })),
  LiveTranscriptionEvents: {
    Open: 'open', Close: 'close', Error: 'error', Transcript: 'Results',
  },
}));

import { createDeepgramClient, toArrayBuffer } from './deepgram.js';

function makeClient() {
  return createDeepgramClient({ apiKey: 'real-key', onTranscript: vi.fn(), onError: vi.fn() });
}

describe('toArrayBuffer', () => {
  it('copies only the bytes viewed by a pooled Buffer slice', () => {
    // Small Buffers share Node's pool — `.buffer` is the whole 8KB pool.
    const pooled = Buffer.from([1, 2, 3]);
    const slice = Buffer.concat([Buffer.from([9, 9]), Buffer.from([4, 5, 6]), Buffer.from([9])]).subarray(2, 5);
    expect(pooled.buffer.byteLength).toBeGreaterThan(3);
    expect([...new Uint8Array(toArrayBuffer(pooled))]).toEqual([1, 2, 3]);
    expect([...new Uint8Array(toArrayBuffer(slice))]).toEqual([4, 5, 6]);
  });
});

describe('createDeepgramClient', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sdkMock.handlers.clear();
    for (const fn of Object.values(sdkMock.connection)) fn.mockClear();
  });
  afterEach(() => { vi.useRealTimers(); });

  it('sends exactly the chunk bytes, not the shared backing buffer', () => {
    const dg = makeClient();
    dg.send(Buffer.from([7, 8, 9]));
    const sent = sdkMock.connection.send.mock.calls[0][0] as ArrayBuffer;
    expect(sent.byteLength).toBe(3);
    expect([...new Uint8Array(sent)]).toEqual([7, 8, 9]);
  });

  it('drops audio after the Deepgram connection closes instead of buffering forever', () => {
    const dg = makeClient();
    sdkMock.handlers.get('close')!();
    dg.send(Buffer.from([1, 2, 3]));
    expect(sdkMock.connection.send).not.toHaveBeenCalled();
  });

  it('drops audio and does not re-close after finish()', () => {
    const dg = makeClient();
    dg.finish();
    dg.finish();
    dg.send(Buffer.from([1]));
    expect(sdkMock.connection.requestClose).toHaveBeenCalledTimes(1);
    expect(sdkMock.connection.send).not.toHaveBeenCalled();
  });

  it('sends KeepAlive while open and stops after close', () => {
    makeClient();
    sdkMock.handlers.get('open')!();
    vi.advanceTimersByTime(8_000);
    expect(sdkMock.connection.keepAlive).toHaveBeenCalledTimes(1);
    sdkMock.handlers.get('close')!();
    vi.advanceTimersByTime(30_000);
    expect(sdkMock.connection.keepAlive).toHaveBeenCalledTimes(1);
  });
});
