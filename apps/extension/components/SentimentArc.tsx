interface SentimentArcProps {
  value: number; // 0–100
  history?: number[];
}

function sentimentColor(value: number): string {
  if (value >= 65) return 'var(--success)';
  if (value >= 40) return 'var(--warning)';
  return 'var(--danger)';
}

export function SentimentArc({ value, history = [] }: SentimentArcProps) {
  const color = sentimentColor(value);
  const clampedValue = Math.max(0, Math.min(100, value));

  return (
    <div className="px-4 py-3 border-b border-black/5">
      <div className="text-[9px] font-semibold tracking-[0.1em] uppercase text-[--text-tertiary] mb-2">
        Engagement
      </div>
      <div className="h-[3px] bg-black/[0.06] rounded-full overflow-hidden mb-1">
        <div
          className="h-full rounded-full transition-[width] duration-[1200ms] ease"
          style={{ width: `${clampedValue}%`, backgroundColor: color }}
        />
      </div>
      <div className="flex justify-between text-[9px] text-[--text-tertiary]">
        <span>cold</span>
        <span style={{ color }}>{clampedValue}%</span>
        <span>hot</span>
      </div>
      {history.length > 1 && (
        <svg
          className="w-full mt-2 opacity-0 group-hover:opacity-100 transition-opacity"
          height="20"
          viewBox={`0 0 ${history.length - 1} 20`}
          preserveAspectRatio="none"
        >
          <polyline
            fill="none"
            stroke={color}
            strokeWidth="1.5"
            points={history
              .map((v, i) => `${i},${20 - (v / 100) * 20}`)
              .join(' ')}
          />
        </svg>
      )}
    </div>
  );
}
