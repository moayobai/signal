import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../lib/api';
import { SentimentRing } from '../components/SentimentRing';
import { CheckIcon, WarnIcon, TargetIcon, CopyIcon, SparkIcon } from '../components/icons';

const TYPE_TAG: Record<string, string> = {
  investor: 'tag-investor', enterprise: 'tag-enterprise',
  bd: 'tag-bd', customer: 'tag-customer',
};

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export default function CallDetail() {
  const { id = '' } = useParams();
  const callQ       = useQuery({ queryKey: ['call', id], queryFn: () => api.call(id) });
  const transcriptQ = useQuery({ queryKey: ['transcript', id], queryFn: () => api.transcript(id) });
  const framesQ     = useQuery({ queryKey: ['frames', id], queryFn: () => api.frames(id) });
  const summaryQ    = useQuery({ queryKey: ['summary', id], queryFn: () => api.summary(id), retry: false });
  const [copied, setCopied] = useState(false);

  if (!callQ.data) {
    return <div className="loading" style={{ height: 260 }} />;
  }
  const call = callQ.data;

  function copyFollowUp() {
    if (!summaryQ.data) return;
    navigator.clipboard.writeText(summaryQ.data.followUpDraft);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div>
      <header className="page-head">
        <div className="call-hero">
          <SentimentRing value={call.sentimentAvg} size={104} stroke={7} />
          <div>
            <div className="when">{fmtDate(call.startedAt)} · {fmtTime(call.startedAt)}</div>
            <h1>Call breakdown</h1>
            <div className="meta-row">
              <span className={`tag ${TYPE_TAG[call.callType] ?? ''}`}>{call.callType}</span>
              <span className="muted" style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                {call.platform} · {call.durationMs ? `${Math.round(call.durationMs / 60000)} min` : 'in progress'}
              </span>
            </div>
          </div>
        </div>
      </header>

      {summaryQ.data ? (
        <>
          <div className="summary-grid">
            <article className="sumcard win">
              <div className="head"><CheckIcon size={11} /> Win signals</div>
              <ul>
                {summaryQ.data.winSignals.length === 0
                  ? <li className="muted">None recorded.</li>
                  : summaryQ.data.winSignals.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </article>
            <article className="sumcard obj">
              <div className="head"><WarnIcon size={11} /> Objections</div>
              <ul>
                {summaryQ.data.objections.length === 0
                  ? <li className="muted">None recorded.</li>
                  : summaryQ.data.objections.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </article>
            <article className="sumcard dec">
              <div className="head"><TargetIcon size={11} /> Decisions</div>
              <ul>
                {summaryQ.data.decisions.length === 0
                  ? <li className="muted">None recorded.</li>
                  : summaryQ.data.decisions.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </article>
          </div>

          <article className="followup-card">
            <div className="head">
              <h3>Follow-up draft</h3>
              <button className="btn" onClick={copyFollowUp}>
                <CopyIcon size={13} /> {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <div className="body">{summaryQ.data.followUpDraft}</div>
          </article>
        </>
      ) : (
        <article className="empty glass" style={{ marginBottom: 28 }}>
          <div className="glyph"><SparkIcon /></div>
          <p>No summary generated for this call yet.</p>
        </article>
      )}

      <article className="transcript-card">
        <div className="section-head" style={{ margin: '0 0 16px', borderBottom: 'none', paddingBottom: 0 }}>
          <h2>Transcript</h2>
          <span className="meta">{transcriptQ.data?.length ?? 0} lines</span>
        </div>
        <div className="transcript">
          {transcriptQ.data?.length === 0 ? (
            <div className="empty"><p>Transcript was not captured for this call.</p></div>
          ) : transcriptQ.data?.map(l => (
            <div className="line" key={l.id}>
              <span className={`speaker ${l.speaker}`}>{l.speaker}</span>
              <span className="text">{l.text}</span>
            </div>
          ))}
        </div>
      </article>

      <article className="frames-card">
        <div className="section-head" style={{ margin: '0 0 16px', borderBottom: 'none', paddingBottom: 0 }}>
          <h2>Signal frames</h2>
          <span className="meta">{framesQ.data?.length ?? 0} fired</span>
        </div>
        <div className="frames">
          {framesQ.data?.length === 0 ? (
            <div className="empty"><p>No signals fired during this call.</p></div>
          ) : framesQ.data?.map(f => (
            <div className={`frame-row ${f.dangerFlag ? 'danger' : ''}`} key={f.id}>
              <span className={`pt-badge pt-${f.promptType}`}>{f.promptType}</span>
              <span className="frame-text">{f.promptText}</span>
              <span className="conf">conf {f.confidence.toFixed(2)}</span>
              <span className="sent">sent {f.sentiment}</span>
              <span className="danger">{f.dangerFlag ? '!' : ''}</span>
            </div>
          ))}
        </div>
      </article>
    </div>
  );
}
