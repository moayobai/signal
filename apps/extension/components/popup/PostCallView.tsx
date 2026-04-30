import type { PostCallSummary } from '@signal/types';

export function PostCallView({
  summary,
  onNewCall,
}: {
  summary: PostCallSummary;
  onNewCall: () => void;
}) {
  const copy = () => navigator.clipboard.writeText(summary.followUpDraft);
  return (
    <div className="post-call">
      <h3>Call summary</h3>
      <h4>Win signals</h4>
      <ul>
        {summary.winSignals.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ul>
      <h4>Objections</h4>
      <ul>
        {summary.objections.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ul>
      <h4>Decisions</h4>
      <ul>
        {summary.decisions.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ul>
      <h4>Follow-up draft</h4>
      <pre className="followup">{summary.followUpDraft}</pre>
      <div className="actions">
        <button onClick={copy}>Copy</button>
        <button onClick={onNewCall}>New call</button>
      </div>
    </div>
  );
}
