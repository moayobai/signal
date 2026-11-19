/**
 * Shared sentiment helpers for the extension UI.
 *
 * Thresholds match the dashboard's SentimentRing (>=70 positive, >=50 neutral)
 * so the same score reads the same colour everywhere.
 */

export const SENTIMENT_THRESHOLDS = {
  positive: 70,
  neutral: 50,
} as const;

/** Trend changes smaller than this (in points) are treated as flat. */
export const SENTIMENT_TREND_DEADBAND = 2;

/** Number of samples back the trend is measured against. */
export const SENTIMENT_TREND_WINDOW = 3;

export type SentimentBand = 'positive' | 'neutral' | 'negative' | 'unknown';

/** Coerces a raw server value to a 0–100 score, or null if unusable. */
export function sanitizeSentiment(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, value));
}

export function sentimentBand(value: number | null | undefined): SentimentBand {
  const v = sanitizeSentiment(value);
  if (v == null) return 'unknown';
  if (v >= SENTIMENT_THRESHOLDS.positive) return 'positive';
  if (v >= SENTIMENT_THRESHOLDS.neutral) return 'neutral';
  return 'negative';
}

export const SENTIMENT_BAND_LABEL: Record<SentimentBand, string> = {
  positive: 'Positive',
  neutral: 'Neutral',
  negative: 'At risk',
  unknown: 'No signal',
};

export type TrendDirection = 'up' | 'down' | 'flat';

export interface SentimentTrend {
  delta: number;
  direction: TrendDirection;
}

/**
 * Rounded change between the latest sample and the one `window` samples
 * earlier (or the oldest available). Returns null until two samples exist.
 */
export function sentimentTrend(
  history: readonly number[],
  window: number = SENTIMENT_TREND_WINDOW,
  deadband: number = SENTIMENT_TREND_DEADBAND,
): SentimentTrend | null {
  if (history.length < 2) return null;
  const latest = history[history.length - 1];
  const base = history[Math.max(0, history.length - 1 - Math.max(1, window))];
  const delta = Math.round(latest - base);
  const direction: TrendDirection =
    Math.abs(delta) < deadband ? 'flat' : delta > 0 ? 'up' : 'down';
  return { delta, direction };
}

/** SVG polyline points for a 0–100 series in a `width` × `height` box. */
export function sparklinePoints(
  history: readonly number[],
  width: number,
  height: number,
): string {
  const values = history
    .map(sanitizeSentiment)
    .filter((v): v is number => v != null);
  if (values.length < 2) return '';
  const step = width / (values.length - 1);
  return values
    .map((v, i) => `${round2(i * step)},${round2(height - (v / 100) * height)}`)
    .join(' ');
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
