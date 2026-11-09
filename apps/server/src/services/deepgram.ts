import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk';
import type { TranscriptLine } from '@signal/types';

const PLACEHOLDER_PREFIXES = ['your-deepgram'];

function isPlaceholderKey(key: string): boolean {
  if (!key) return true;
  return PLACEHOLDER_PREFIXES.some(p => key.startsWith(p));
}

interface DeepgramClientOptions {
  apiKey: string;
  /** Deepgram model name. Defaults to 'nova-3'. Override via DEEPGRAM_MODEL env var. */
  model?: string;
  onTranscript: (line: TranscriptLine) => void;
  onError: (err: unknown) => void;
}

export interface DeepgramHandle {
  send: (chunk: Buffer) => void;
  finish: () => void;
}

/** Deepgram closes idle streams after ~10s without audio; ping well within that. */
const KEEPALIVE_INTERVAL_MS = 8_000;

/**
 * Copy exactly the bytes a Buffer views into a standalone ArrayBuffer.
 * `buf.buffer` alone is wrong: small Node Buffers are slices of a shared pool,
 * so the backing ArrayBuffer contains unrelated bytes before/after the chunk.
 */
export function toArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

export function createDeepgramClient(options: DeepgramClientOptions): DeepgramHandle {
  const { apiKey, model = 'nova-3', onTranscript, onError } = options;

  if (isPlaceholderKey(apiKey)) {
    console.log('[SIGNAL] Deepgram key is placeholder — STT disabled');
    return {
      send: () => {},
      finish: () => {},
    };
  }

  const client = createClient(apiKey);
  const connection = client.listen.live({
    model,
    language: 'en',
    diarize: true,
    punctuate: true,
    interim_results: false,
    smart_format: true,
  });

  connection.on(LiveTranscriptionEvents.Transcript, (data) => {
    const alt = data.channel?.alternatives?.[0];
    if (!alt?.transcript?.trim()) return;
    if (data.is_final === false) return;

    const speakerNum = alt.words?.[0]?.speaker ?? 0;
    const line: TranscriptLine = {
      speaker: speakerNum === 0 ? 'user' : 'prospect',
      text: alt.transcript.trim(),
      timestamp: Date.now(),
    };
    onTranscript(line);
  });

  // Once closed (or finished), stop forwarding audio — the SDK would otherwise
  // queue every chunk in an unbounded in-memory buffer that is never flushed.
  let closed = false;
  let keepAliveTimer: NodeJS.Timeout | null = null;
  const stopKeepAlive = (): void => {
    if (keepAliveTimer) { clearInterval(keepAliveTimer); keepAliveTimer = null; }
  };

  connection.on(LiveTranscriptionEvents.Open, () => {
    if (closed) return;
    keepAliveTimer = setInterval(() => {
      try {
        connection.keepAlive();
      } catch (err) {
        console.error('[SIGNAL] Deepgram keepAlive error:', err);
      }
    }, KEEPALIVE_INTERVAL_MS);
  });

  connection.on(LiveTranscriptionEvents.Error, onError);

  connection.on(LiveTranscriptionEvents.Close, () => {
    closed = true;
    stopKeepAlive();
    console.log('[SIGNAL] Deepgram connection closed');
  });

  return {
    send: (chunk: Buffer) => {
      if (closed || chunk.byteLength === 0) return;
      try {
        connection.send(toArrayBuffer(chunk));
      } catch (err) {
        console.error('[SIGNAL] Deepgram send error:', err);
      }
    },
    finish: () => {
      if (closed) return;
      closed = true;
      stopKeepAlive();
      try {
        connection.requestClose();
      } catch {
        // already closed
      }
    },
  };
}
