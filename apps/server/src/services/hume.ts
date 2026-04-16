/**
 * Hume AI Expression Measurement — streaming WebSocket client.
 *
 * Sends JPEG video frames (base64) to Hume's face emotion model and
 * fires onFaceSignals with the top detected emotions.
 *
 * Gracefully no-ops when HUME_API_KEY is a placeholder or missing.
 * Docs: https://dev.hume.ai/docs/expression-measurement/stream
 */
import WebSocket from 'ws';
import type { FaceSignals } from '@signal/types';

const HUME_WS_URL = 'wss://api.hume.ai/v0/stream/models';
const PLACEHOLDER_PREFIXES = ['your-hume'];

function isPlaceholderKey(key: string): boolean {
  if (!key) return true;
  return PLACEHOLDER_PREFIXES.some(p => key.startsWith(p));
}

export interface HumeClientOptions {
  apiKey: string;
  onFaceSignals: (signals: FaceSignals) => void;
  onError?: (err: unknown) => void;
}

export interface HumeHandle {
  sendFrame(base64Jpeg: string): void;
  close(): void;
}

/** No-op handle returned when Hume is disabled. */
const NOOP_HANDLE: HumeHandle = {
  sendFrame: () => {},
  close: () => {},
};

export function createHumeClient(opts: HumeClientOptions): HumeHandle {
  if (isPlaceholderKey(opts.apiKey)) {
    return NOOP_HANDLE;
  }

  // apiKey passed as query param (browser-WebSocket-compatible, avoids header limitation)
  const url = `${HUME_WS_URL}?apiKey=${encodeURIComponent(opts.apiKey)}`;
  const ws = new WebSocket(url);
  let ready = false;
  const queue: string[] = [];

  ws.on('open', () => {
    ready = true;
    // Drain any frames queued before connection was established
    for (const frame of queue) {
      _send(frame);
    }
    queue.length = 0;
  });

  ws.on('message', (raw: Buffer | string) => {
    try {
      const payload = JSON.parse(raw.toString()) as HumeStreamResponse;
      if (payload.error) {
        console.error('[SIGNAL] Hume error:', payload.error);
        return;
      }
      const predictions = payload.face?.predictions;
      if (!predictions?.length) return;

      // Use the prediction with the highest-confidence face bbox
      const best = predictions.reduce((a, b) =>
        (b.bbox?.prob ?? 0) > (a.bbox?.prob ?? 0) ? b : a,
      );

      if (!best.emotions?.length) return;

      const sorted = [...best.emotions].sort((a, b) => b.score - a.score);
      const top3 = sorted.slice(0, 3).map(e => ({ name: e.name, score: Math.round(e.score * 100) / 100 }));

      const signals: FaceSignals = {
        topEmotions: top3,
        dominantEmotion: top3[0]?.name ?? 'Unknown',
        attention: Math.round((best.bbox?.prob ?? 0) * 100) / 100,
      };

      opts.onFaceSignals(signals);
    } catch (err) {
      opts.onError?.(err);
    }
  });

  ws.on('error', (err) => {
    console.error('[SIGNAL] Hume WS error:', err);
    opts.onError?.(err);
  });

  ws.on('close', () => {
    ready = false;
  });

  function _send(base64Jpeg: string): void {
    if (ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({
      models: { face: { identify_faces: false, prob_threshold: 0.8 } },
      data: base64Jpeg,
    }));
  }

  return {
    sendFrame(base64Jpeg: string): void {
      if (ready) {
        _send(base64Jpeg);
      } else {
        // Buffer at most 1 frame while connecting (don't queue stale frames)
        queue[0] = base64Jpeg;
      }
    },
    close(): void {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    },
  };
}

// ── Hume response shapes ────────────────────────────────────────────────────

interface HumeEmotion {
  name: string;
  score: number;
}

interface HumeFacePrediction {
  bbox?: { x: number; y: number; w: number; h: number; prob: number };
  emotions?: HumeEmotion[];
}

interface HumeStreamResponse {
  error?: string;
  face?: {
    predictions?: HumeFacePrediction[];
  };
}
