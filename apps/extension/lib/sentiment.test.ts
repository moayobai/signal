import { describe, expect, it } from 'vitest';
import {
  sanitizeSentiment,
  sentimentBand,
  smoothSentiment,
  sentimentTrend,
  sparklinePoints,
} from './sentiment';

describe('sanitizeSentiment', () => {
  it('clamps to 0–100', () => {
    expect(sanitizeSentiment(-5)).toBe(0);
    expect(sanitizeSentiment(150)).toBe(100);
    expect(sanitizeSentiment(42.5)).toBe(42.5);
  });

  it('rejects non-finite and non-numeric values', () => {
    expect(sanitizeSentiment(NaN)).toBeNull();
    expect(sanitizeSentiment(Infinity)).toBeNull();
    expect(sanitizeSentiment(undefined)).toBeNull();
    expect(sanitizeSentiment(null)).toBeNull();
    expect(sanitizeSentiment('70')).toBeNull();
  });
});

describe('sentimentBand', () => {
  it('uses the dashboard thresholds (70 / 50)', () => {
    expect(sentimentBand(70)).toBe('positive');
    expect(sentimentBand(69.9)).toBe('neutral');
    expect(sentimentBand(50)).toBe('neutral');
    expect(sentimentBand(49.9)).toBe('negative');
    expect(sentimentBand(0)).toBe('negative');
  });

  it('returns unknown for missing data', () => {
    expect(sentimentBand(null)).toBe('unknown');
    expect(sentimentBand(undefined)).toBe('unknown');
    expect(sentimentBand(NaN)).toBe('unknown');
  });
});

describe('smoothSentiment', () => {
  it('passes the first sample through unchanged', () => {
    expect(smoothSentiment(null, 80)).toBe(80);
  });

  it('moves partway toward the new sample', () => {
    expect(smoothSentiment(50, 90, 0.5)).toBe(70);
    expect(smoothSentiment(50, 90, 0.25)).toBe(60);
  });

  it('damps a one-frame spike and converges on a sustained shift', () => {
    let s: number | null = 60;
    s = smoothSentiment(s, 10);
    expect(s).toBeGreaterThan(30);
    s = smoothSentiment(s, 60);
    expect(s).toBeGreaterThan(45);

    let t: number | null = 30;
    for (let i = 0; i < 8; i++) t = smoothSentiment(t, 80);
    expect(t).toBeGreaterThan(79);
  });
});

describe('sentimentTrend', () => {
  it('needs at least two samples', () => {
    expect(sentimentTrend([])).toBeNull();
    expect(sentimentTrend([50])).toBeNull();
  });

  it('compares against the sample `window` steps back', () => {
    expect(sentimentTrend([10, 20, 30, 40, 50], 3)).toEqual({ delta: 30, direction: 'up' });
    expect(sentimentTrend([80, 60], 3)).toEqual({ delta: -20, direction: 'down' });
  });

  it('treats sub-deadband movement as flat', () => {
    expect(sentimentTrend([50, 51], 3, 2)?.direction).toBe('flat');
    expect(sentimentTrend([50, 52], 3, 2)?.direction).toBe('up');
  });
});

describe('sparklinePoints', () => {
  it('returns empty for fewer than two usable samples', () => {
    expect(sparklinePoints([], 100, 20)).toBe('');
    expect(sparklinePoints([50, NaN], 100, 20)).toBe('');
  });

  it('maps samples across the width and inverts y', () => {
    expect(sparklinePoints([0, 50, 100], 100, 20)).toBe('0,20 50,10 100,0');
  });

  it('clamps out-of-range values and drops invalid ones', () => {
    expect(sparklinePoints([-10, NaN, 120], 10, 20)).toBe('0,20 10,0');
  });
});
