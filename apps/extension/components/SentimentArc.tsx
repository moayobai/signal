import {
  SENTIMENT_BAND_LABEL,
  SENTIMENT_THRESHOLDS,
  type SentimentBand,
  sanitizeSentiment,
  sentimentBand,
  sparklinePoints,
} from '../lib/sentiment';

interface SentimentArcProps {
  value: number | null | undefined; // 0–100
  history?: number[];
}

const BAND_COLOR: Record<SentimentBand, string> = {
  positive: 'var(--success)',
  neutral: 'var(--warning)',
  negative: 'var(--danger)',
  unknown: 'var(--text-tertiary)',
};

const SPARK_W = 100;
const SPARK_H = 20;

export function SentimentArc({ value, history = [] }: SentimentArcProps) {
  const v = sanitizeSentiment(value);
  const band = sentimentBand(v);
  const color = BAND_COLOR[band];
  const points = sparklinePoints(history, SPARK_W, SPARK_H);

  return (
    <div className="group px-4 py-3 border-b border-black/5">
      <div className="text-[9px] font-semibold tracking-[0.1em] uppercase text-[--text-tertiary] mb-2">
        Engagement
      </div>
      <div
        role="meter"
        aria-label="Engagement"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={v == null ? undefined : Math.round(v)}
        aria-valuetext={v == null ? SENTIMENT_BAND_LABEL.unknown : `${Math.round(v)}% — ${SENTIMENT_BAND_LABEL[band]}`}
        className="relative h-[3px] bg-black/[0.06] rounded-full overflow-hidden mb-1"
      >
        <div
          className="h-full rounded-full transition-[width,background-color] duration-500 ease-out"
          style={{ width: `${v ?? 0}%`, backgroundColor: color }}
        />
        {[SENTIMENT_THRESHOLDS.neutral, SENTIMENT_THRESHOLDS.positive].map((t) => (
          <span
            key={t}
            aria-hidden="true"
            className="absolute top-0 h-full w-px bg-black/20"
            style={{ left: `${t}%` }}
          />
        ))}
      </div>
      <div className="flex justify-between text-[9px] text-[--text-tertiary]">
        <span>cold</span>
        <span style={{ color }}>{v == null ? '—' : `${Math.round(v)}%`}</span>
        <span>hot</span>
      </div>
      {points && (
        <svg
          className="w-full mt-2 opacity-0 group-hover:opacity-100 transition-opacity"
          height={SPARK_H}
          viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <polyline
            fill="none"
            stroke={color}
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
            points={points}
          />
        </svg>
      )}
    </div>
  );
}
