import { useEffect, useState } from 'react';
import type { Prospect } from '@signal/types';

export function OctaMemPanel({ prospect }: { prospect: Prospect }) {
  const [context, setContext] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!prospect.name) { setContext(null); return; }
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        // Query through background (which knows the server URL)
        const res = await chrome.runtime.sendMessage({ type: 'OCTAMEM_QUERY', prospect });
        setContext(res?.context ?? null);
      } catch { setContext(null); }
      setLoading(false);
    }, 500);
    return () => clearTimeout(timer);
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
