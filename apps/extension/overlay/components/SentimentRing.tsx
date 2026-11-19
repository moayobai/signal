import {
  SENTIMENT_BAND_LABEL,
  SENTIMENT_THRESHOLDS,
  type SentimentBand,
  sanitizeSentiment,
  sentimentBand,
} from '../../lib/sentiment';

interface Props {
  value: number | null;
  size?: number;
  stroke?: number;
  showLabel?: boolean;
}

const BAND_COLOR: Record<SentimentBand, string> = {
  positive: '#34d399',
  neutral: '#fbbf24',
  negative: '#fb7185',
  unknown: 'rgba(255,255,255,0.3)',
};

/**
 * Apple Activity-rings sentiment dial — overlay copy of the dashboard primitive.
 * Self-contained: no stylesheet dependency.
 */
export function SentimentRing({ value, size = 72, stroke = 5, showLabel = true }: Props) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const cx = size / 2;
  const v = sanitizeSentiment(value);
  const offset = c * (1 - (v ?? 0) / 100);
  const band = sentimentBand(v);
  const color = BAND_COLOR[band];
  const labelSize = Math.max(12, Math.round(size / 4));

  // Threshold ticks so the user can see how close the score is to a band edge.
  const ticks = [SENTIMENT_THRESHOLDS.neutral, SENTIMENT_THRESHOLDS.positive].map((t) => {
    const a = (t / 100) * 2 * Math.PI;
    const inner = r - stroke / 2 - 1;
    const outer = r + stroke / 2 + 1;
    return {
      t,
      x1: cx + inner * Math.cos(a), y1: cx + inner * Math.sin(a),
      x2: cx + outer * Math.cos(a), y2: cx + outer * Math.sin(a),
    };
  });

  return (
    <div
      role="meter"
      aria-label="Sentiment"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={v == null ? undefined : Math.round(v)}
      aria-valuetext={v == null ? SENTIMENT_BAND_LABEL.unknown : `${Math.round(v)} — ${SENTIMENT_BAND_LABEL[band]}`}
      style={{ position: 'relative', display: 'inline-grid', placeItems: 'center', width: size, height: size, color }}
    >
      <svg width={size} height={size} style={{ display: 'block', transform: 'rotate(-90deg)' }} aria-hidden="true">
        <circle
          cx={cx} cy={cx} r={r}
          fill="none" strokeWidth={stroke}
          stroke="rgba(255,255,255,0.08)"
        />
        {v != null && (
          <circle
            cx={cx} cy={cx} r={r}
            fill="none" strokeWidth={stroke}
            stroke="currentColor"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={offset}
            style={{
              // Ease-out without overshoot: the ring never visually passes the real score.
              transition: 'stroke-dashoffset 600ms cubic-bezier(0.22, 1, 0.36, 1), stroke 400ms ease',
              filter: 'drop-shadow(0 0 6px currentColor)',
            }}
          />
        )}
        {ticks.map(({ t, x1, y1, x2, y2 }) => (
          <line key={t} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(255,255,255,0.35)" strokeWidth={1} />
        ))}
      </svg>
      {showLabel && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'grid', placeItems: 'center',
          fontFamily: 'JetBrains Mono, SF Mono, ui-monospace, monospace',
          fontWeight: 500,
          fontSize: labelSize,
          letterSpacing: '0.02em',
          transition: 'color 400ms ease',
        }}>
          {v == null ? '—' : Math.round(v)}
        </div>
      )}
    </div>
  );
}
