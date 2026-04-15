interface Props {
  value: number | null;
  size?: number;
  stroke?: number;
  showLabel?: boolean;
}

/**
 * Apple Activity-rings sentiment dial — overlay copy of the dashboard primitive.
 * Self-contained: no stylesheet dependency.
 */
export function SentimentRing({ value, size = 72, stroke = 5, showLabel = true }: Props) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = value == null ? 0 : Math.max(0, Math.min(100, value));
  const offset = c * (1 - v / 100);

  const color =
    value == null ? 'rgba(255,255,255,0.3)'
    : v >= 70 ? '#34d399'
    : v >= 50 ? '#fbbf24'
    : '#fb7185';
  const labelSize = Math.max(12, Math.round(size / 4));

  return (
    <div style={{ position: 'relative', display: 'inline-grid', placeItems: 'center', width: size, height: size, color }}>
      <svg width={size} height={size} style={{ display: 'block', transform: 'rotate(-90deg)' }}>
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" strokeWidth={stroke}
          stroke="rgba(255,255,255,0.08)"
        />
        {value != null && (
          <circle
            cx={size / 2} cy={size / 2} r={r}
            fill="none" strokeWidth={stroke}
            stroke="currentColor"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={offset}
            style={{
              transition: 'stroke-dashoffset 700ms cubic-bezier(0.2, 0.8, 0.25, 1)',
              filter: 'drop-shadow(0 0 6px currentColor)',
            }}
          />
        )}
      </svg>
      {showLabel && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'grid', placeItems: 'center',
          fontFamily: 'JetBrains Mono, SF Mono, ui-monospace, monospace',
          fontWeight: 500,
          fontSize: labelSize,
          letterSpacing: '0.02em',
        }}>
          {value == null ? '—' : Math.round(value)}
        </div>
      )}
    </div>
  );
}
