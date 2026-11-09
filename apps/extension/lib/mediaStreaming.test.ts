import { afterEach, describe, expect, it, vi } from 'vitest';
import { bytesToBase64, startRecorder } from './mediaStreaming';
import { SOCKET_OPEN, type SocketLike } from './captureSession';

describe('bytesToBase64', () => {
  it('encodes frames larger than the chunk size without overflowing', () => {
    const bytes = new Uint8Array(200_000).map((_, i) => i % 256);
    expect(bytesToBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'));
  });
});

describe('startRecorder', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('records only the audio tracks so an audio mimeType works with a video stream', () => {
    const audio = { kind: 'audio' };
    const video = { kind: 'video' };
    const recorders: Array<{ stream: { tracks: unknown[] }; state: string; stop: () => void }> = [];

    class FakeMediaStream { constructor(public tracks: unknown[]) {} }
    class FakeMediaRecorder {
      static isTypeSupported = () => true;
      state = 'recording';
      ondataavailable: unknown = null;
      constructor(public stream: { tracks: unknown[] }) { recorders.push(this); }
      start() {}
      stop = vi.fn(() => { this.state = 'inactive'; });
    }
    vi.stubGlobal('MediaStream', FakeMediaStream);
    vi.stubGlobal('MediaRecorder', FakeMediaRecorder);

    const stream = {
      getAudioTracks: () => [audio],
      getVideoTracks: () => [video],
    } as unknown as MediaStream;
    const ws = { readyState: SOCKET_OPEN, send: vi.fn() } as unknown as SocketLike;

    const stop = startRecorder(stream, ws);
    expect(recorders).toHaveLength(1);
    expect(recorders[0].stream.tracks).toEqual([audio]);

    stop();
    expect(recorders[0].stop).toHaveBeenCalledOnce();
    stop();
    expect(recorders[0].stop).toHaveBeenCalledOnce();
  });
});
