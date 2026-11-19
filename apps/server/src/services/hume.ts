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
/** Minimum face-detection probability; requested from Hume and re-checked locally. */
export const FACE_PROB_THRESHOLD = 0.8;
/** EMA weight for each new frame's emotion scores. Lower = steadier, slower. */
const EMOTION_EMA_ALPHA = 0.4;

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

  const smoother = new FaceEmotionSmoother();

  ws.on('message', (raw: Buffer | string) => {
    try {
      const payload = JSON.parse(raw.toString()) as HumeStreamResponse;
      if (payload.error) {
        console.error('[SIGNAL] Hume error:', payload.error);
        return;
      }
      const signals = extractFaceSignals(payload, smoother);
      if (signals) opts.onFaceSignals(signals);
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
      models: { face: { identify_faces: false, prob_threshold: FACE_PROB_THRESHOLD } },
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

/**
 * Exponential moving average over the full emotion vector. Single frames are
 * noisy (a blink or head turn can flip the top emotion), so the top-3 is
 * computed from smoothed scores rather than the raw frame.
 */
export class FaceEmotionSmoother {
  private scores = new Map<string, number>();

  constructor(private readonly alpha = EMOTION_EMA_ALPHA) {}

  update(emotions: HumeEmotion[]): Array<{ name: string; score: number }> {
    if (this.scores.size === 0) {
      for (const e of emotions) this.scores.set(e.name, e.score);
    } else {
      const seen = new Set<string>();
      for (const e of emotions) {
        seen.add(e.name);
        const prev = this.scores.get(e.name) ?? 0;
        this.scores.set(e.name, prev + this.alpha * (e.score - prev));
      }
      // Emotions missing from this frame decay toward zero.
      for (const [name, prev] of this.scores) {
        if (!seen.has(name)) this.scores.set(name, prev * (1 - this.alpha));
      }
    }
    return [...this.scores.entries()]
      .map(([name, score]) => ({ name, score }))
      .sort((a, b) => b.score - a.score);
  }

  reset(): void {
    this.scores.clear();
  }
}

/**
 * Converts a Hume stream response into FaceSignals. Returns null when no face
 * clears the detection threshold, so a poorly-framed frame never overwrites a
 * good earlier read.
 */
export function extractFaceSignals(
  payload: HumeStreamResponse,
  smoother?: FaceEmotionSmoother,
): FaceSignals | null {
  const predictions = payload.face?.predictions;
  if (!predictions?.length) return null;

  // Use the prediction with the highest-confidence face bbox
  const best = predictions.reduce((a, b) =>
    (b.bbox?.prob ?? 0) > (a.bbox?.prob ?? 0) ? b : a,
  );
  const prob = best.bbox?.prob ?? 0;
  if (prob < FACE_PROB_THRESHOLD || !best.emotions?.length) return null;

  const ranked = smoother
    ? smoother.update(best.emotions)
    : [...best.emotions].sort((a, b) => b.score - a.score);
  const top3 = ranked.slice(0, 3).map(e => ({ name: e.name, score: Math.round(e.score * 100) / 100 }));

  return {
    topEmotions: top3,
    dominantEmotion: top3[0]?.name ?? 'Unknown',
    attention: Math.round(prob * 100) / 100,
  };
}

// ── Hume response shapes ────────────────────────────────────────────────────

export interface HumeEmotion {
  name: string;
  score: number;
}

export interface HumeFacePrediction {
  bbox?: { x: number; y: number; w: number; h: number; prob: number };
  emotions?: HumeEmotion[];
}

export interface HumeStreamResponse {
  error?: string;
  face?: {
    predictions?: HumeFacePrediction[];
  };
}
