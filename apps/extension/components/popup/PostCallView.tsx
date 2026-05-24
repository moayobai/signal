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
      <div className="post-head">
        <span>Debrief saved</span>
        <h3>Next move is ready.</h3>
      </div>
      <section className="summary-section win">
        <h4>Win signals</h4>
        <ul>
          {summary.winSignals.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      </section>
      <section className="summary-section obj">
        <h4>Objections</h4>
        <ul>
          {summary.objections.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      </section>
      <section className="summary-section dec">
        <h4>Decisions</h4>
        <ul>
          {summary.decisions.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      </section>
      <section className="summary-section follow">
        <h4>Follow-up draft</h4>
        <pre className="followup">{summary.followUpDraft}</pre>
      </section>
      <div className="actions">
        <button onClick={copy}>Copy</button>
        <button onClick={onNewCall}>New call</button>
      </div>
    </div>
  );
}
