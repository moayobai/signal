import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { SearchIcon, ArrowRightIcon } from '../components/icons';

/** 400ms debounce so every keystroke doesn't round-trip to Voyage. */
function useDebounced<T>(value: T, delayMs: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return v;
}

function formatWhen(ts: number | null): string {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function Search() {
  const [params, setParams] = useSearchParams();
  const initial = params.get('q') ?? '';
  const [input, setInput] = useState(initial);
  const debounced = useDebounced(input, 400);

  // Keep URL ?q in sync with the debounced value so links are shareable.
  useEffect(() => {
    const current = params.get('q') ?? '';
    if (debounced === current) return;
    const next = new URLSearchParams(params);
    if (debounced) next.set('q', debounced);
    else next.delete('q');
    setParams(next, { replace: true });
  }, [debounced]); // eslint-disable-line react-hooks/exhaustive-deps

  const q = debounced.trim();
  const query = useQuery({
    queryKey: ['search', q],
    queryFn: () => api.searchTranscripts(q, 20),
    enabled: q.length > 0,
    retry: false,
  });

  const results = query.data ?? [];
  const errorMsg = useMemo(() => {
    if (!query.isError) return null;
    const e = query.error;
    if (e instanceof ApiError && e.status === 503) {
      return 'Semantic search requires a Voyage API key. Set VOYAGE_API_KEY on the server and try again.';
    }
    return e instanceof Error ? e.message : 'Search failed';
  }, [query.isError, query.error]);

  return (
    <div>
      <header className="page-head">
        <div className="titles">
          <span className="eyebrow">Explore</span>
          <h1>Search across <em>transcripts</em></h1>
          <p className="subtitle">
            Ask in plain English — "where did we push back on pricing?", "objections about security",
            "moments of genuine enthusiasm". Voyage embeddings match meaning, not just keywords.
          </p>
        </div>
      </header>

      <div className="glass search-bar" style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '14px 18px', borderRadius: 'var(--r-lg)', marginBottom: 24,
      }}>
        <span style={{ color: 'var(--ink-3)' }}><SearchIcon size={18} /></span>
        <input
          autoFocus
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Find every call where…"
          maxLength={200}
          style={{
            flex: 1, background: 'transparent', border: 'none', outline: 'none',
            color: 'var(--ink-1)', fontFamily: 'var(--font-ui)', fontSize: 16,
          }}
        />
        {input && (
          <button
            onClick={() => setInput('')}
            style={{
              background: 'transparent', border: 'none', color: 'var(--ink-3)',
              cursor: 'pointer', fontSize: 13,
            }}
          >Clear</button>
        )}
      </div>

      {q.length === 0 && (
        <div className="empty glass">
          <div className="glyph"><SearchIcon /></div>
          <p>Type a question above. Results appear as you type.</p>
        </div>
      )}

      {q.length > 0 && query.isLoading && (
        <ul className="call-list">
          {[0, 1, 2].map(i => (
            <li key={i}><div className="glass" style={{ height: 92, borderRadius: 'var(--r-md)' }} /></li>
          ))}
        </ul>
      )}

      {q.length > 0 && errorMsg && (
        <div className="empty glass">
          <p style={{ color: 'var(--neg-strong)' }}>{errorMsg}</p>
        </div>
      )}

      {q.length > 0 && !query.isLoading && !errorMsg && results.length === 0 && (
        <div className="empty glass">
          <div className="glyph"><SearchIcon /></div>
          <p>No matches — try different words.</p>
        </div>
      )}

      {results.length > 0 && (
        <ul className="call-list">
          {results.map(r => (
            <li key={`${r.sessionId}-${r.chunkIndex}`}>
              <Link to={`/calls/${r.sessionId}`} className="call-row" style={{
                alignItems: 'flex-start', gap: 16, padding: '16px 18px',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="who" style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                    <span className="name">{r.contactName ?? 'Unknown prospect'}</span>
                    {r.contactCompany && (
                      <span className="sub" style={{ color: 'var(--ink-3)' }}>· {r.contactCompany}</span>
                    )}
                    <span className="when" style={{ marginLeft: 'auto', color: 'var(--ink-3)', fontSize: 12 }}>
                      {formatWhen(r.calledAt)}
                    </span>
                  </div>
                  <p style={{
                    margin: '8px 0 10px', color: 'var(--ink-2)', lineHeight: 1.5,
                    fontSize: 14, fontFamily: 'var(--font-ui)',
                  }}>
                    <span style={{
                      color: r.speaker === 'user' ? 'var(--pt-ask)' : 'var(--pt-body)',
                      fontWeight: 600, marginRight: 6,
                    }}>
                      {r.speaker === 'user' ? 'You' : r.speaker === 'prospect' ? 'Prospect' : r.speaker}:
                    </span>
                    {r.text.length > 320 ? r.text.slice(0, 320).trim() + '…' : r.text}
                  </p>
                  <SimilarityBar value={r.similarity} />
                </div>
                <span className="arrow" style={{ alignSelf: 'center' }}><ArrowRightIcon /></span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SimilarityBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(value * 100)));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{
        flex: 1, height: 3, background: 'rgba(255,255,255,0.06)',
        borderRadius: 2, overflow: 'hidden',
      }}>
        <div style={{
          width: `${pct}%`, height: '100%',
          background: 'var(--grad-signal)',
        }} />
      </div>
      <span style={{ color: 'var(--ink-3)', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
        {pct}%
      </span>
    </div>
  );
}
