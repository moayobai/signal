interface Props {
  value: number | null;
  size?: number;
  stroke?: number;
  showLabel?: boolean;
}

/**
 * Apple Activity-rings inspired sentiment dial.
 * value: 0–100 (or null for "no data" → empty ring with em-dash)
 */
export function SentimentRing({ value, size = 64, stroke = 5, showLabel = true }: Props) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = value == null ? 0 : Math.max(0, Math.min(100, value));
  const offset = c * (1 - v / 100);

  const tone = value == null ? 'ring-neutral' : v >= 70 ? 'ring-pos' : v >= 50 ? 'ring-neutral' : 'ring-neg';
  const labelSize = Math.max(11, Math.round(size / 4.2));

  return (
    <div className={`ring ${tone}`} style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle
          className="ring-track"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
        />
        {value != null && (
          <circle
            className="ring-fill"
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="currentColor"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={offset}
          />
        )}
      </svg>
      {showLabel && (
        <div className="ring-label" style={{ fontSize: labelSize }}>
          {value == null ? '—' : Math.round(value)}
        </div>
      )}
    </div>
  );
}
