import { useEffect, useState } from 'react';
import type { Prospect } from '@signal/types';

export function OctaMemPanel({ prospect }: { prospect: Prospect }) {
  const [context, setContext] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Clearing the name mid-request must not leave the panel stuck on "Loading…".
    if (!prospect.name) { setContext(null); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      let next: string | null = null;
      try {
        // Query through background (which knows the server URL)
        const res = await chrome.runtime.sendMessage({ type: 'OCTAMEM_QUERY', prospect });
        next = res?.context ?? null;
      } catch { /* treat as no context */ }
      // Ignore responses for a prospect the user has since edited away from.
      if (cancelled) return;
      setContext(next);
      setLoading(false);
    }, 500);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [prospect.name, prospect.company]);

  return (
    <section className="octamem">
      <h4>OctaMem context</h4>
      {loading ? <div className="muted">Loading…</div>
        : context ? <p>{context}</p>
        : <div className="muted">No prior context.</div>}
    </section>
  );
}
