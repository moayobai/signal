/**
 * Live sentiment post-processing.
 *
 * Raw per-frame sentiment from the LLM is noisy: two consecutive 90s windows
 * that overlap by ~80% can come back 30 points apart. This module:
 *  - blends in a facial-valence read from Hume when a fresh, clearly-detected
 *    face is available,
 *  - smooths the series with a confidence-weighted EMA (with a small dead band
 *    so the overlay doesn't flicker on 1–2 point changes),
 *  - computes a confidence-weighted call average for post-call reporting.
 */
import type { FaceSignals } from '@signal/types';

export const NEUTRAL_SENTIMENT = 50;

/** Hume face emotions mapped to valence in [-1, 1]. Unlisted emotions are neutral. */
const FACE_VALENCE: Record<string, number> = {
  Joy: 1, Amusement: 0.9, Excitement: 0.8, Satisfaction: 0.8, Admiration: 0.7,
  Adoration: 0.6, Contentment: 0.6, Interest: 0.5, Relief: 0.5, Triumph: 0.6,
  Calmness: 0.2, Concentration: 0.1, Contemplation: 0.1, Realization: 0.2,
  Anger: -1, Contempt: -0.9, Disgust: -0.9, Annoyance: -0.7, Distress: -0.7,
  Disappointment: -0.7, Doubt: -0.5, Boredom: -0.5, Anxiety: -0.4,
  Confusion: -0.3, Awkwardness: -0.3, Tiredness: -0.3, Sadness: -0.6,
  Fear: -0.5, Embarrassment: -0.3, Pain: -0.6,
};

/** Faces detected below this probability are too unreliable to blend in. */
export const MIN_FACE_ATTENTION = 0.6;
/** Maximum share of the blended score the face read can contribute. */
export const MAX_FACE_WEIGHT = 0.25;
/** Face reads older than this are ignored (prospect may have turned the camera off). */
export const FACE_STALE_MS = 10_000;

export function clampSentiment(n: number): number {
  if (!Number.isFinite(n)) return NEUTRAL_SENTIMENT;
  return Math.max(0, Math.min(100, n));
}

/**
 * Converts face emotions to a 0–100 sentiment score, or null when there is no
 * usable signal (no face, low detection probability, or only neutral emotions).
 */
export function faceValenceScore(face: FaceSignals | undefined): number | null {
  if (!face || face.attention < MIN_FACE_ATTENTION || face.topEmotions.length === 0) return null;
  let weighted = 0;
  let total = 0;
  for (const e of face.topEmotions) {
    const v = FACE_VALENCE[e.name];
    if (v === undefined || e.score <= 0) continue;
    weighted += v * e.score;
    total += e.score;
  }
  if (total === 0) return null;
  return clampSentiment(NEUTRAL_SENTIMENT + (weighted / total) * 50);
}

/**
 * Blends transcript sentiment with facial valence. Face weight scales with
 * detection confidence and is capped so the transcript stays authoritative.
 */
export function blendSentiment(textSentiment: number, face: FaceSignals | undefined): number {
  const text = clampSentiment(textSentiment);
  const faceScore = faceValenceScore(face);
  if (faceScore === null || !face) return text;
  const w = MAX_FACE_WEIGHT * face.attention;
  return text * (1 - w) + faceScore * w;
}

export interface SentimentTrackerOptions {
  /** Base EMA weight for a fully confident reading (0–1). Higher = more responsive. */
  alpha?: number;
  /** Lower bound on reading confidence so low-confidence frames still move the needle a little. */
  minConfidence?: number;
  /** Changes smaller than this (in points) are absorbed to avoid UI flicker. */
  deadBand?: number;
}

export class SentimentTracker {
  private readonly alpha: number;
  private readonly minConfidence: number;
  private readonly deadBand: number;
  private smoothed: number | null = null;
  private weightedSum = 0;
  private weightTotal = 0;

  constructor(opts: SentimentTrackerOptions = {}) {
    this.alpha = opts.alpha ?? 0.5;
    this.minConfidence = opts.minConfidence ?? 0.3;
    this.deadBand = opts.deadBand ?? 2;
  }

  /**
   * Feeds a raw reading and returns the smoothed sentiment (integer 0–100).
   * The first reading is taken as-is so the overlay responds immediately.
   */
  update(raw: number, confidence = 1): number {
    const value = clampSentiment(raw);
    const conf = Math.max(this.minConfidence, Math.min(1, Number.isFinite(confidence) ? confidence : 1));

    this.weightedSum += value * conf;
    this.weightTotal += conf;

    if (this.smoothed === null) {
      this.smoothed = value;
    } else {
      const next = this.smoothed + this.alpha * conf * (value - this.smoothed);
      if (Math.abs(next - this.smoothed) >= this.deadBand) this.smoothed = next;
    }
    return Math.round(this.smoothed);
  }

  get current(): number | null {
    return this.smoothed === null ? null : Math.round(this.smoothed);
  }

  /** Confidence-weighted mean of all raw readings, or null if none were recorded. */
  get average(): number | null {
    return this.weightTotal > 0 ? this.weightedSum / this.weightTotal : null;
  }
}
