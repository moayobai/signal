import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { userFacingLabel } from '@signal/types';
import { api, type CallScorecard } from '../lib/api';
import { SentimentRing } from '../components/SentimentRing';
import {
  CheckIcon,
  WarnIcon,
  TargetIcon,
  CopyIcon,
  SparkIcon,
  PencilIcon,
} from '../components/icons';

const TYPE_TAG: Record<string, string> = {
  investor: 'tag-investor',
  enterprise: 'tag-enterprise',
  bd: 'tag-bd',
  customer: 'tag-customer',
};

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export default function CallDetail() {
  const { id = '' } = useParams();
  const callQ = useQuery({ queryKey: ['call', id], queryFn: () => api.call(id) });
  const transcriptQ = useQuery({ queryKey: ['transcript', id], queryFn: () => api.transcript(id) });
  const framesQ = useQuery({ queryKey: ['frames', id], queryFn: () => api.frames(id) });
  const summaryQ = useQuery({
    queryKey: ['summary', id],
    queryFn: () => api.summary(id),
    retry: false,
  });
  const contactQ = useQuery({
    queryKey: ['contact', callQ.data?.contactId],
    queryFn: () => api.contact(callQ.data!.contactId!),
    enabled: !!callQ.data?.contactId,
    retry: false,
  });
  const [copied, setCopied] = useState(false);
  const [expandedFrames, setExpandedFrames] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (summaryQ.data) setDraft(summaryQ.data.followUpDraft);
  }, [summaryQ.data]);

  function toggleFrame(fid: number) {
    setExpandedFrames(prev => {
      const next = new Set(prev);
      if (next.has(fid)) next.delete(fid);
      else next.add(fid);
      return next;
    });
  }

  function fmtOffset(ms: number): string {
    const s = Math.max(0, Math.floor(ms / 1000));
    const mm = Math.floor(s / 60)
      .toString()
      .padStart(2, '0');
    const ss = (s % 60).toString().padStart(2, '0');
    return `${mm}:${ss}`;
  }

  if (!callQ.data) {
    return (
      <div>
        <div className="skel-title" style={{ marginBottom: 18 }} />
        <div className="skel-card" />
      </div>
    );
  }
  const call = callQ.data;
  const prospectLabel = contactQ.data?.name ?? 'Prospect';

  function copyFollowUp() {
    navigator.clipboard.writeText(draft);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function speakerLabel(speaker: string): string {
    const s = speaker.toLowerCase();
    if (s === 'user' || s === 'me' || s === 'self') return 'You';
    if (s === 'prospect' || s === 'them' || s === 'other') return prospectLabel;
    return speaker;
  }

  return (
    <div>
      <header className="page-head">
        <div className="call-hero">
          <SentimentRing value={call.sentimentAvg} size={104} stroke={7} />
          <div>
            <div className="when">
              {fmtDate(call.startedAt)} · {fmtTime(call.startedAt)}
            </div>
            <h1>Call breakdown</h1>
            <div className="meta-row">
              <span className={`tag ${TYPE_TAG[call.callType] ?? ''}`}>{call.callType}</span>
              <span className="muted" style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                {call.platform} ·{' '}
                {call.durationMs ? `${Math.round(call.durationMs / 60000)} min` : 'in progress'}
              </span>
            </div>
          </div>
          <TalkRatioCard
            talkRatio={call.talkRatio ?? null}
            longestMonologueMs={call.longestMonologueMs ?? null}
          />
        </div>
      </header>

      {summaryQ.data ? (
        <>
          <div className="summary-grid">
            <article className="sumcard win">
              <div className="head">
                <CheckIcon size={11} /> Win signals
              </div>
              <ul>
                {summaryQ.data.winSignals.length === 0 ? (
                  <li className="muted">None recorded.</li>
                ) : (
                  summaryQ.data.winSignals.map((s, i) => <li key={i}>{s}</li>)
                )}
              </ul>
            </article>
            <article className="sumcard obj">
              <div className="head">
                <WarnIcon size={11} /> Objections
              </div>
              <ul>
                {summaryQ.data.objections.length === 0 ? (
                  <li className="muted">None recorded.</li>
                ) : (
                  summaryQ.data.objections.map((s, i) => <li key={i}>{s}</li>)
                )}
              </ul>
            </article>
            <article className="sumcard dec">
              <div className="head">
                <TargetIcon size={11} /> Decisions
              </div>
              <ul>
                {summaryQ.data.decisions.length === 0 ? (
                  <li className="muted">None recorded.</li>
                ) : (
                  summaryQ.data.decisions.map((s, i) => <li key={i}>{s}</li>)
                )}
              </ul>
            </article>
          </div>

          {summaryQ.data.scorecard && <ScorecardSection scorecard={summaryQ.data.scorecard} />}

          <article className={`followup-card ${editing ? 'editing' : ''}`}>
            <div className="head">
              <h3>Follow-up draft</h3>
              <div className="head-actions">
                <button
                  className="btn btn-ghost"
                  onClick={() => setEditing(e => !e)}
                  aria-label={editing ? 'Finish editing' : 'Edit draft'}
                  title={editing ? 'Done editing' : 'Edit draft'}
                >
                  {editing ? <CheckIcon size={13} /> : <PencilIcon size={13} />}
                  {editing ? 'Done' : 'Edit'}
                </button>
                <button className="btn" onClick={copyFollowUp}>
                  <CopyIcon size={13} /> {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
            {editing ? (
              <textarea
                className="body"
                value={draft}
                onChange={e => setDraft(e.target.value)}
                autoFocus
              />
            ) : (
              <div className="body">{draft}</div>
            )}
          </article>
        </>
      ) : (
        <article className="empty glass" style={{ marginBottom: 28 }}>
          <div className="glyph">
            <SparkIcon />
          </div>
          <p>No summary generated for this call yet.</p>
        </article>
      )}

      <article className="transcript-card">
        <div
          className="section-head"
          style={{ margin: '0 0 16px', borderBottom: 'none', paddingBottom: 0 }}
        >
          <h2>Transcript</h2>
          <span className="meta">{transcriptQ.data?.length ?? 0} lines</span>
        </div>
        <div className="transcript">
          {transcriptQ.data?.length === 0 ? (
            <div className="empty">
              <p>Transcript was not captured for this call.</p>
            </div>
          ) : (
            transcriptQ.data?.map(l => (
              <div className="line" key={l.id}>
                <span className={`speaker ${l.speaker}`}>{speakerLabel(l.speaker)}</span>
                <span className="text">{l.text}</span>
              </div>
            ))
          )}
        </div>
      </article>

      <article className="frames-card">
        <div
          className="section-head"
          style={{ margin: '0 0 16px', borderBottom: 'none', paddingBottom: 0 }}
        >
          <h2>Signal frames</h2>
          <span className="meta">{framesQ.data?.length ?? 0} fired</span>
        </div>
        <div className="frames">
          {framesQ.data?.length === 0 ? (
            <div className="empty">
              <p>No signals fired during this call.</p>
            </div>
          ) : (
            framesQ.data?.map(f => {
              const expanded = expandedFrames.has(f.id);
              return (
                <div className={`frame-row ${f.dangerFlag ? 'danger' : ''}`} key={f.id}>
                  <span className="tstamp">{fmtOffset(f.offsetMs)}</span>
                  <span className={`pt-badge pt-${f.promptType}`}>
                    {userFacingLabel(f.promptType)}
                  </span>
                  <span className="frame-text">{f.promptText}</span>
                  <button
                    className="frame-expand"
                    onClick={() => toggleFrame(f.id)}
                    aria-label={expanded ? 'Hide details' : 'Show details'}
                    title={expanded ? 'Hide details' : 'Show details'}
                    style={{
                      background: 'transparent',
                      border: '1px solid var(--glass-border)',
                      width: 22,
                      height: 22,
                      borderRadius: 999,
                      color: 'var(--ink-3)',
                      cursor: 'pointer',
                    }}
                  >
                    {expanded ? '×' : '…'}
                  </button>
                  <span className="sent">sent {f.sentiment}</span>
                  <span className="danger">{f.dangerFlag ? '!' : ''}</span>
                  {expanded && (
                    <div className="frame-details">
                      <span className="conf">conf {f.confidence.toFixed(2)}</span>
                      <span className="sent">sent {f.sentiment}</span>
                      <span className="raw-type">type {f.promptType}</span>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </article>
    </div>
  );
}

function talkRatioHint(ratio: number): { label: string; color: string } {
  const pct = ratio * 100;
  if (pct > 65) return { label: 'Target: 45% talk time', color: '#ef4444' };
  if (pct > 55) return { label: 'Target: 45% talk time', color: '#f5a524' };
  if (pct >= 35) return { label: 'Target: 45% talk time', color: '#22c55e' };
  return { label: 'Target: 45% talk time', color: '#f5a524' };
}

function fmtMonologue(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

function TalkRatioCard({
  talkRatio,
  longestMonologueMs,
}: {
  talkRatio: number | null;
  longestMonologueMs: number | null;
}) {
  if (talkRatio == null) {
    return (
      <div
        className="talk-ratio-card"
        style={{
          marginLeft: 'auto',
          minWidth: 220,
          padding: '12px 14px',
          borderRadius: 12,
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <div
          className="muted"
          style={{ fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase' }}
        >
          Talk ratio
        </div>
        <div style={{ fontSize: 13, marginTop: 6 }} className="muted">
          —
        </div>
      </div>
    );
  }
  const userPct = Math.round(talkRatio * 100);
  const prospectPct = 100 - userPct;
  const hint = talkRatioHint(talkRatio);
  return (
    <div
      className="talk-ratio-card"
      style={{
        marginLeft: 'auto',
        minWidth: 240,
        padding: '12px 14px',
        borderRadius: 12,
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <div
        className="muted"
        style={{ fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8 }}
      >
        Talk ratio
      </div>
      <div
        style={{
          display: 'flex',
          height: 8,
          borderRadius: 4,
          overflow: 'hidden',
          background: 'rgba(255,255,255,0.06)',
        }}
      >
        <div style={{ flexBasis: `${userPct}%`, background: 'var(--accent)' }} />
        <div style={{ flexBasis: `${prospectPct}%`, background: '#3b82f6' }} />
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 11,
          marginTop: 6,
          fontFamily: 'var(--font-mono)',
        }}
      >
        <span style={{ color: 'var(--accent)' }}>YOU {userPct}%</span>
        <span style={{ color: '#3b82f6' }}>PROSPECT {prospectPct}%</span>
      </div>
      {longestMonologueMs != null && (
        <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
          Longest monologue: {fmtMonologue(longestMonologueMs)}
        </div>
      )}
      <div style={{ fontSize: 11, marginTop: 4, color: hint.color }}>{hint.label}</div>
    </div>
  );
}

function scoreColor(score: number): string {
  if (score >= 8) return '#22c55e';
  if (score >= 5) return '#f5a524';
  return '#ef4444';
}

function ScorecardSection({ scorecard }: { scorecard: CallScorecard }) {
  return (
    <article
      className="scorecard-card"
      style={{
        marginBottom: 28,
        padding: '20px 22px',
        borderRadius: 14,
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 18 }}>
        <span
          className="tag"
          style={{
            padding: '4px 10px',
            borderRadius: 999,
            fontSize: 11,
            letterSpacing: 0.8,
            fontWeight: 600,
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          {scorecard.framework}
        </span>
        <h3
          style={{
            margin: 0,
            fontSize: 14,
            letterSpacing: 0.4,
            textTransform: 'uppercase',
            color: 'var(--ink-3)',
          }}
        >
          Scorecard
        </h3>
        <div
          style={{
            marginLeft: 'auto',
            fontFamily: 'var(--font-serif, Fraunces, Georgia, serif)',
            fontStyle: 'italic',
            fontSize: 44,
            lineHeight: 1,
            color: scoreColor(scorecard.overallScore / 10),
          }}
        >
          {scorecard.overallScore}
          <span style={{ fontSize: 18, color: 'var(--ink-3)' }}>/100</span>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 12,
          marginBottom: 18,
        }}
      >
        {scorecard.dimensions.map(d => (
          <div
            key={d.key}
            style={{
              padding: '12px 14px',
              borderRadius: 10,
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.05)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                marginBottom: 8,
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 500 }}>{d.label}</span>
              <span
                style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: scoreColor(d.score) }}
              >
                {d.score.toFixed(1)}/10
              </span>
            </div>
            <div
              style={{
                height: 4,
                borderRadius: 2,
                background: 'rgba(255,255,255,0.06)',
                overflow: 'hidden',
                marginBottom: 8,
              }}
            >
              <div
                style={{
                  width: `${Math.min(100, d.score * 10)}%`,
                  height: '100%',
                  background: scoreColor(d.score),
                }}
              />
            </div>
            <div className="muted" style={{ fontSize: 12, lineHeight: 1.45 }}>
              {d.justification}
            </div>
          </div>
        ))}
      </div>

      {scorecard.nextSteps.length > 0 && (
        <div>
          <div
            className="muted"
            style={{
              fontSize: 11,
              letterSpacing: 0.6,
              textTransform: 'uppercase',
              marginBottom: 8,
            }}
          >
            Next steps
          </div>
          <ul
            style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}
          >
            {scorecard.nextSteps.map((s, i) => (
              <li key={i} style={{ fontSize: 13, lineHeight: 1.5 }}>
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}
