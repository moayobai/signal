import { useEffect, useState } from 'react';
import type { SignalFrame } from '@signal/types';

interface Props {
  frame: SignalFrame;
  danger: boolean;
  /** Key that changes when a new frame arrives — triggers re-animation. */
  freshKey: number;
  onDismiss?: () => void;
}

/**
 * Top-centre hero nudge card.
 * Reanimates every time `freshKey` changes, then dims to 55% after 8s
 * (unless in danger state — then stays prominent).
 */
export function NudgeCard({ frame, danger, freshKey, onDismiss }: Props) {
  const [dimmed, setDimmed] = useState(false);

  useEffect(() => {
    setDimmed(false);
    if (danger) return;
    const t = setTimeout(() => setDimmed(true), 8000);
    return () => clearTimeout(t);
  }, [freshKey, danger]);

  const pct = Math.round(frame.prompt.confidence * 100);
  const typeClass = `sig-badge-${frame.prompt.type}`;

  return (
    <div
      className={`sig-nudge ${danger ? 'danger' : ''} ${dimmed ? 'dim' : ''}`}
      onMouseEnter={() => setDimmed(false)}
    >
      <div className="head">
        <div className="label">
          <span className={`badge ${typeClass}`}>{frame.prompt.type}</span>
          <span className="meta">Signal · {pct}% confidence</span>
        </div>
        {onDismiss && (
          <button className="dismiss" onClick={onDismiss} aria-label="dismiss">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M3 3l6 6M9 3l-6 6" />
            </svg>
          </button>
        )}
      </div>

      <div className="body">{frame.prompt.text}</div>

      {danger && frame.dangerReason && (
        <div className="danger-reason">⚠ {frame.dangerReason}</div>
      )}

      <div className="conf" style={{ color: getTypeColor(frame.prompt.type) }}>
        <span>confidence</span>
        <div className="bar"><div className="fill" style={{ width: `${pct}%` }} /></div>
        <span>{pct}%</span>
      </div>
    </div>
  );
}

function getTypeColor(type: string): string {
  switch (type) {
    case 'ASK':     return '#60a5fa';
    case 'CLOSE':   return '#34d399';
    case 'WARN':    return '#fb7185';
    case 'REFRAME': return '#c084fc';
    case 'BODY':    return '#fbbf24';
    case 'SILENCE': return '#94a3b8';
    default:        return '#64748b';
  }
}
