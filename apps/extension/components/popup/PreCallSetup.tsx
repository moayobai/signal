import { useState } from 'react';
import type { CallType, Prospect } from '@signal/types';
import { OctaMemPanel } from './OctaMemPanel';

interface Props {
  prospect: Prospect;
  onChange: (p: Prospect) => void;
  onStart: (callType: CallType) => void;
}

const CALL_TYPES: CallType[] = ['investor', 'enterprise', 'bd', 'customer'];

export function PreCallSetup({ prospect, onChange, onStart }: Props) {
  const [callType, setCallType] = useState<CallType>('investor');
  const canStart = prospect.name.trim().length > 0;

  return (
    <div className="pre-call">
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
