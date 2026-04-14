import { useEffect, useRef } from 'react';
import type { TranscriptLine } from '@signal/types';

interface TranscriptFeedProps {
  lines: TranscriptLine[];
  maxVisible?: number;
}

export function TranscriptFeed({ lines, maxVisible = 4 }: TranscriptFeedProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const visibleLines = lines.slice(-maxVisible);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines.length]);

  return (
    <div className="px-4 py-2.5 border-b border-black/5 max-h-[88px] overflow-hidden">
      {visibleLines.map((line) => (
        <div
          key={line.timestamp}
          className="animate-[slide-up_320ms_ease-out]"
          style={{ animationFillMode: 'both' }}
        >
          <div
            className={`text-[9px] font-semibold tracking-[0.06em] uppercase mb-0.5 ${
              line.speaker === 'prospect' ? 'text-[--accent]' : 'text-[--text-tertiary]'
            }`}
          >
            {line.speaker === 'prospect' ? 'PROSPECT' : 'YOU'}
          </div>
          <p className="text-[11px] text-[--text-secondary] leading-[1.5] mb-1.5">
            {line.text}
          </p>
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
}
