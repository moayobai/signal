import { useEffect, useState } from 'react';
import { userFacingLabel, type SignalFrame } from '@signal/types';

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
      role={danger ? 'alert' : 'status'}
      aria-live={danger ? 'assertive' : 'polite'}
      aria-label={`Signal: ${userFacingLabel(frame.prompt.type)}`}
      onMouseEnter={() => setDimmed(false)}
    >
      <div className="head">
        <div className="label">
          <span className={`badge ${typeClass}`} title={badgeTooltip(frame.prompt.type)}>
            {userFacingLabel(frame.prompt.type)}
          </span>
          <span className="meta">Signal · {pct}% confidence</span>
        </div>
        {onDismiss && (
          <button
            className="dismiss"
            onClick={onDismiss}
            aria-label="Dismiss nudge (Escape)"
            title="Dismiss — Escape to snooze 5s"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            >
              <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" />
            </svg>
          </button>
        )}
      </div>

      <div className="body">{frame.prompt.text}</div>

      {danger && frame.dangerReason && <div className="danger-reason">⚠ {frame.dangerReason}</div>}

      <div className="conf" style={{ color: getTypeColor(frame.prompt.type) }}>
        <span>confidence</span>
        <div className="bar">
          <div className="fill" style={{ width: `${pct}%` }} />
        </div>
        <span>{pct}%</span>
      </div>
    </div>
  );
}

function getTypeColor(type: string): string {
  switch (type) {
    case 'ASK':
      return '#60a5fa';
    case 'CLOSE':
      return '#34d399';
    case 'WARN':
      return '#fb7185';
    case 'REFRAME':
      return '#c084fc';
    case 'BODY':
      return '#fbbf24';
    case 'SILENCE':
      return '#94a3b8';
    default:
      return '#64748b';
  }
}

function badgeTooltip(type: string): string {
  switch (type) {
    case 'ASK':
      return 'Ask — surface a question to keep them engaged';
    case 'CLOSE':
      return 'Close — buying signal detected, push for next step';
    case 'WARN':
      return 'Warn — something is off, course-correct now';
    case 'REFRAME':
      return 'Reframe — shift the angle of the conversation';
    case 'BODY':
      return 'Body — prospect signals need attention';
    case 'SILENCE':
      return 'Silence — prospect is thinking, give them space';
    default:
      return 'Signal';
  }
}
