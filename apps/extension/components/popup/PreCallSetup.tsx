import { useEffect, useState } from 'react';
import type { CallType, Prospect } from '@signal/types';
import { OctaMemPanel } from './OctaMemPanel';

interface Props {
  prospect: Prospect;
  onChange: (p: Prospect) => void;
  onStart: (callType: CallType) => void;
}

const CALL_TYPES: CallType[] = ['investor', 'enterprise', 'bd', 'customer'];

interface DetectedMeeting {
  id: string;
  title: string;
  startTime: number;
  attendees: Array<{ email: string; name?: string; isOrganizer?: boolean }>;
  meetingLink?: string | null;
}

function localPart(email: string): string {
  const at = email.indexOf('@');
  return at > 0 ? email.slice(0, at) : email;
}

export function PreCallSetup({ prospect, onChange, onStart }: Props) {
  const [callType, setCallType] = useState<CallType>('investor');
  const [detected, setDetected] = useState<DetectedMeeting | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const canStart = prospect.name.trim().length > 0;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await chrome.runtime.sendMessage({ type: 'NEXT_MEETING' });
        if (!cancelled) setDetected(res?.meeting ?? null);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const showBanner = detected && !dismissed;
  const minutes = detected ? Math.max(0, Math.round((detected.startTime - Date.now()) / 60000)) : 0;

  function applyDetected(): void {
    if (!detected) return;
    const primary = detected.attendees.find(a => !a.isOrganizer) ?? detected.attendees[0];
    if (!primary) { setDismissed(true); return; }
    const name = primary.name?.trim() || localPart(primary.email);
    onChange({ ...prospect, name, email: primary.email });
    setDismissed(true);
  }

  return (
    <div className="pre-call">
      {showBanner && (
        <div
          style={{
            padding: '10px 12px',
            borderRadius: 8,
            background: 'rgba(245, 165, 36, 0.12)',
            border: '1px solid rgba(245, 165, 36, 0.35)',
            marginBottom: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 13,
          }}
        >
          <span role="img" aria-label="calendar">🗓</span>
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            Detected: <strong>{detected!.title}</strong> in {minutes} min
          </span>
          <button className="pill active" onClick={applyDetected}>Use this</button>
          <button className="pill" onClick={() => setDismissed(true)} aria-label="Dismiss">×</button>
        </div>
      )}

      <section>
        <h3>Prospect</h3>
        <label>Name<input value={prospect.name} onChange={e => onChange({ ...prospect, name: e.target.value })} /></label>
        <label>Company<input value={prospect.company ?? ''} onChange={e => onChange({ ...prospect, company: e.target.value })} /></label>
        <label>Email<input value={prospect.email ?? ''} onChange={e => onChange({ ...prospect, email: e.target.value })} /></label>
        <label>LinkedIn URL<input value={prospect.linkedinUrl ?? ''} onChange={e => onChange({ ...prospect, linkedinUrl: e.target.value })} /></label>
      </section>

      <section>
        <h3>Call type</h3>
        <div className="pills">
          {CALL_TYPES.map(t => (
            <button key={t} className={callType === t ? 'pill active' : 'pill'} onClick={() => setCallType(t)}>{t}</button>
          ))}
        </div>
      </section>

      <OctaMemPanel prospect={prospect} />

      <button className="start-btn" disabled={!canStart} onClick={() => onStart(callType)}>Start Call</button>
    </div>
  );
}
