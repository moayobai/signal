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

export function createDeepgramClient(options: DeepgramClientOptions): DeepgramHandle {
  const { apiKey, model = 'nova-3', onTranscript, onError } = options;

  if (isPlaceholderKey(apiKey)) {
    console.info('[SIGNAL] Deepgram key is placeholder — STT disabled');
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

  connection.on(LiveTranscriptionEvents.Transcript, data => {
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

  connection.on(LiveTranscriptionEvents.Error, onError);

  connection.on(LiveTranscriptionEvents.Close, () => {
    console.info('[SIGNAL] Deepgram connection closed');
  });

  return {
    send: (chunk: Buffer) => {
      try {
        connection.send(chunk.buffer as ArrayBufferLike);
      } catch (err) {
        console.error('[SIGNAL] Deepgram send error:', err);
      }
    },
    finish: () => {
      try {
        connection.finish();
      } catch {
        // already closed
      }
    },
  };
}
