import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';

export default function Home() {
  const calls = useQuery({ queryKey: ['calls'], queryFn: api.calls });
  const prompts = useQuery({ queryKey: ['prompt-types'], queryFn: api.promptTypes });

  const recent = calls.data?.slice(0, 10) ?? [];
  const total = calls.data?.length ?? 0;
  const avg = calls.data
    ?.filter(c => c.sentimentAvg != null)
    .reduce((a, c, _, arr) => a + (c.sentimentAvg ?? 0) / arr.length, 0);
  const topPrompt = prompts.data?.sort((a, b) => b.count - a.count)[0];

  return (
    <div>
      <h2>Home</h2>
      <div className="stats">
        <div>Total calls: <b>{total}</b></div>
        <div>Avg sentiment: <b>{avg ? Math.round(avg) : '—'}/100</b></div>
        <div>Top prompt type: <b>{topPrompt?.promptType ?? '—'}</b></div>
      </div>
      <h3>Recent calls</h3>
      <ul className="call-list">
        {recent.map(c => (
          <li key={c.id}>
            <Link to={`/calls/${c.id}`}>
              {new Date(c.startedAt).toLocaleString()} · {c.platform} · {c.callType}
              {c.durationMs && ` · ${Math.round(c.durationMs / 60000)}m`}
              {c.sentimentAvg != null && ` · ${Math.round(c.sentimentAvg)}/100`}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
