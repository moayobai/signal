import type { BodyLangRead, FaceSignals, SignalFrame, TranscriptLine } from '@signal/types';
import { SentimentRing } from './SentimentRing';

interface Props {
  frame: SignalFrame | null;
  prevSentiment: number | null;
  cueHistory: Array<{ frame: SignalFrame; receivedAt: number }>;
  transcript: TranscriptLine[];
  elapsedSeconds: number;
  danger: boolean;
  onCollapse?: () => void;
}

const BODY_LABELS: Array<{ k: keyof BodyLangRead; label: string }> = [
  { k: 'engagement', label: 'Engagement' },
  { k: 'energy',     label: 'Energy' },
  { k: 'tone',       label: 'Tone' },
];

function formatTime(s: number): string {
  const m = Math.floor(s / 60).toString().padStart(2, '0');
  const sec = (s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
}

function emotionColor(score: number): string {
  if (score >= 0.6) return 'var(--sig-pos)';
  if (score >= 0.35) return '#a5f3fc';
  return 'var(--sig-ink-3)';
}

function FaceSignalsPanel({ signals }: { signals: FaceSignals }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: 'var(--sig-font-mono)', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--sig-ink-3)' }}>
          Dominant
        </span>
        <span style={{ fontSize: 12, color: 'var(--sig-ink-1)', letterSpacing: '-0.005em' }}>
          {signals.dominantEmotion}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: 'var(--sig-font-mono)', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--sig-ink-3)' }}>
          Attention
        </span>
        <span style={{ fontSize: 11, color: signals.attention >= 0.8 ? 'var(--sig-pos)' : 'var(--sig-neutral)' }}>
          {Math.round(signals.attention * 100)}%
        </span>
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 2 }}>
        {signals.topEmotions.map(e => (
          <span key={e.name} style={{
            fontFamily: 'var(--sig-font-mono)', fontSize: 9,
            padding: '2px 6px', borderRadius: 999,
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: emotionColor(e.score),
            letterSpacing: '0.04em',
          }}>
            {e.name} {Math.round(e.score * 100)}%
          </span>
        ))}
      </div>
    </div>
  );
}

function ago(ms: number): string {
  const s = Math.max(1, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m ${r}s`;
}

export function LiveSidebar({
  frame, prevSentiment, cueHistory, transcript, elapsedSeconds, danger, onCollapse,
}: Props) {
  // `elapsedSeconds` ticks every second, keeping renders fresh.
  // Compute `now` at render time so ago() values are accurate.
  const now = Date.now();
  const sentiment = frame?.sentiment ?? null;
  const delta = sentiment != null && prevSentiment != null
    ? Math.round(sentiment - prevSentiment)
    : null;
  const tail = transcript.slice(-5);

  return (
    <aside className={`sig-sidebar ${danger ? 'danger' : ''}`}>
      {/* Header */}
      <div className="head">
        <div className="brand">
          <span className="dot" aria-hidden="true">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <defs>
                <linearGradient id="sig-brand-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#6366f1" />
                  <stop offset="55%" stopColor="#22d3ee" />
                  <stop offset="100%" stopColor="#f5a524" />
                </linearGradient>
              </defs>
              <circle cx="6" cy="6" r="5.25" stroke="url(#sig-brand-grad)" strokeWidth="1.2" />
              <circle cx="6.85" cy="5.65" r="3.35" stroke="url(#sig-brand-grad)" strokeWidth="1.2" />
              <circle cx="6" cy="6" r="1.2" fill="url(#sig-brand-grad)" />
            </svg>
          </span>
          <span>Signal</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="live">
            {danger ? 'Danger' : 'Live'} · {formatTime(elapsedSeconds)}
          </span>
          {onCollapse && (
            <button
              onClick={onCollapse}
              aria-label="minimise"
              style={{
                padding: 4, background: 'transparent', border: 'none',
                color: 'rgba(255,255,255,0.4)', borderRadius: 6,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M3 6h6" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Sentiment section */}
      <section className="section">
        <div className="sentiment">
          <SentimentRing value={sentiment} size={72} stroke={5} showLabel />
          <div className="meta">
            <span className="label-row">Sentiment</span>
            <span className="value">{sentiment != null ? Math.round(sentiment) : '—'}</span>
            {delta != null ? (
              <span className={`delta ${delta > 0 ? 'up' : delta < 0 ? 'down' : ''}`}>
                {delta > 0 ? '↑' : delta < 0 ? '↓' : '·'} {Math.abs(delta)} vs prior
              </span>
            ) : <span className="delta">awaiting baseline</span>}
          </div>
        </div>
      </section>

      {/* Speech signals section */}
      {frame && (
        <section className="section">
          <div className="label">
            <span>Speech</span>
          </div>
          <div className="body-lang">
            {BODY_LABELS.map(({ k, label }) => (
              <div className="row" key={k}>
                <span className="k">{label}</span>
                <span className="v" data-val={frame.bodyLang[k]}>{frame.bodyLang[k]}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Hume AI face signals — only shown when video capture is active */}
      {frame?.faceSignals && (
        <section className="section">
          <div className="label">
            <span>Face</span>
            <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.22)', letterSpacing: '0.06em' }}>HUME AI</span>
          </div>
          <FaceSignalsPanel signals={frame.faceSignals} />
        </section>
      )}

      {/* Cues feed */}
      <section className="section" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div className="label">
          <span>Cues</span>
          <span style={{ color: 'rgba(255,255,255,0.22)' }}>{cueHistory.length}</span>
        </div>
        <div className="cues">
          {cueHistory.length === 0 ? (
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', fontStyle: 'italic', padding: '4px 0' }}>
              Listening — first cue soon.
            </div>
          ) : cueHistory.slice().reverse().map((c, i) => (
            <div key={c.receivedAt} className={`cue ${i === 0 ? 'active' : ''}`}>
              <div className="cue-head">
                <span className={`sig-badge-${c.frame.prompt.type}`} style={{
                  padding: '2px 7px', borderRadius: 999,
                  fontFamily: 'JetBrains Mono, SF Mono, ui-monospace, monospace',
                  fontSize: 9, fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase',
                }}>{c.frame.prompt.type}</span>
                <span className="age">{ago(now - c.receivedAt)}</span>
              </div>
              <div className="text">{c.frame.prompt.text}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Transcript tail */}
      <section className="transcript-tail">
        <div className="label">
          <span>Transcript</span>
        </div>
        {tail.length === 0 ? (
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', fontStyle: 'italic' }}>
            Awaiting audio…
          </div>
        ) : tail.map((l, i) => (
          <div className="line" key={i}>
            <span className={`speaker ${l.speaker}`}>{l.speaker}</span>
            <span className="text-line">{l.text}</span>
          </div>
        ))}
      </section>
    </aside>
  );
}
