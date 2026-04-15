import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

export default function CallDetail() {
  const { id = '' } = useParams();
  const call = useQuery({ queryKey: ['call', id], queryFn: () => api.call(id) });
  const transcript = useQuery({ queryKey: ['transcript', id], queryFn: () => api.transcript(id) });
  const frames = useQuery({ queryKey: ['frames', id], queryFn: () => api.frames(id) });
  const summary = useQuery({ queryKey: ['summary', id], queryFn: () => api.summary(id), retry: false });

  if (!call.data) return <div>Loading…</div>;
  return (
    <div>
      <h2>Call · {new Date(call.data.startedAt).toLocaleString()}</h2>
      <div className="meta">
        {call.data.platform} · {call.data.callType} ·
        {call.data.durationMs && ` ${Math.round(call.data.durationMs / 60000)}m ·`}
        {call.data.sentimentAvg != null && ` ${Math.round(call.data.sentimentAvg)}/100`}
      </div>

      {summary.data && (
        <section>
          <h3>Summary</h3>
          <h4>Win signals</h4><ul>{summary.data.winSignals.map((s, i) => <li key={i}>{s}</li>)}</ul>
          <h4>Objections</h4><ul>{summary.data.objections.map((s, i) => <li key={i}>{s}</li>)}</ul>
          <h4>Decisions</h4><ul>{summary.data.decisions.map((s, i) => <li key={i}>{s}</li>)}</ul>
          <h4>Follow-up draft</h4><pre className="followup">{summary.data.followUpDraft}</pre>
        </section>
      )}

      <section>
        <h3>Transcript</h3>
        <div className="transcript">
          {transcript.data?.map(l => (
            <div key={l.id}><b>[{l.speaker}]</b> {l.text}</div>
          ))}
        </div>
      </section>

      <section>
        <h3>Signal frames</h3>
        <ul className="frames">
          {frames.data?.map(f => (
            <li key={f.id}>
              <b>{f.promptType}</b> · conf {f.confidence.toFixed(2)} · sent {f.sentiment}
              {f.dangerFlag ? ' ⚠️' : ''} — {f.promptText}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
