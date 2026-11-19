import { describe, it, expect } from 'vitest';
import type { FaceSignals } from '@signal/types';
import { SentimentTracker, blendSentiment, clampSentiment, faceValenceScore, MAX_FACE_WEIGHT } from './sentiment.js';

const face = (topEmotions: FaceSignals['topEmotions'], attention = 0.9): FaceSignals => ({
  topEmotions, dominantEmotion: topEmotions[0]?.name ?? 'Unknown', attention,
});

describe('clampSentiment', () => {
  it('clamps to 0–100 and maps non-finite to neutral', () => {
    expect(clampSentiment(-5)).toBe(0);
    expect(clampSentiment(140)).toBe(100);
    expect(clampSentiment(NaN)).toBe(50);
  });
});

describe('faceValenceScore', () => {
  it('scores positive emotions above neutral and negative below', () => {
    expect(faceValenceScore(face([{ name: 'Joy', score: 0.8 }]))!).toBeGreaterThan(80);
    expect(faceValenceScore(face([{ name: 'Anger', score: 0.8 }]))!).toBeLessThan(20);
  });
  it('returns null for low-attention faces or unknown emotions', () => {
    expect(faceValenceScore(face([{ name: 'Joy', score: 0.8 }], 0.3))).toBeNull();
    expect(faceValenceScore(face([{ name: 'Nostalgia', score: 0.8 }]))).toBeNull();
    expect(faceValenceScore(undefined)).toBeNull();
  });
});

describe('blendSentiment', () => {
  it('returns text sentiment unchanged without a usable face', () => {
    expect(blendSentiment(70, undefined)).toBe(70);
  });
  it('caps the face contribution so transcript stays authoritative', () => {
    const blended = blendSentiment(80, face([{ name: 'Anger', score: 1 }], 1));
    // Worst case face=0 with full weight
    expect(blended).toBeCloseTo(80 * (1 - MAX_FACE_WEIGHT), 5);
    expect(blended).toBeGreaterThan(50);
  });
});

describe('SentimentTracker', () => {
  it('takes the first reading as-is', () => {
    const t = new SentimentTracker();
    expect(t.update(72)).toBe(72);
  });

  it('dampens a single outlier', () => {
    const t = new SentimentTracker({ alpha: 0.5 });
    t.update(70);
    const next = t.update(20, 1);
    expect(next).toBe(45);
    expect(next).toBeGreaterThan(20);
  });

  it('moves less on low-confidence readings', () => {
    const hi = new SentimentTracker();
    const lo = new SentimentTracker();
    hi.update(70); lo.update(70);
    expect(lo.update(20, 0.3)).toBeGreaterThan(hi.update(20, 1));
  });

  it('converges toward a sustained shift', () => {
    const t = new SentimentTracker();
    t.update(80);
    let v = 80;
    for (let i = 0; i < 8; i++) v = t.update(30, 0.9);
    expect(v).toBeLessThan(35);
  });

  it('ignores sub-dead-band jitter', () => {
    const t = new SentimentTracker({ deadBand: 2 });
    t.update(60);
    expect(t.update(62, 1)).toBe(60);
  });

  it('computes a confidence-weighted average', () => {
    const t = new SentimentTracker({ minConfidence: 0 });
    expect(t.average).toBeNull();
    t.update(80, 1);
    t.update(20, 0.25);
    expect(t.average).toBeCloseTo((80 + 20 * 0.25) / 1.25, 5);
  });
});
