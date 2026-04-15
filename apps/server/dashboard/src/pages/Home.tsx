import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, type Contact, type CallSession } from '../lib/api';
import { SentimentRing } from '../components/SentimentRing';
import { ArrowRightIcon, TrendingIcon, SparkIcon, TargetIcon } from '../components/icons';

const TYPE_TAG: Record<string, string> = {
  investor: 'tag-investor', enterprise: 'tag-enterprise',
  bd: 'tag-bd', customer: 'tag-customer',
};

function formatWhen(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ' · ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export default function Home() {
  const calls = useQuery({ queryKey: ['calls'], queryFn: api.calls });
  const contacts = useQuery({ queryKey: ['contacts'], queryFn: api.contacts });
  const promptTypes = useQuery({ queryKey: ['prompt-types'], queryFn: api.promptTypes });

  const total = calls.data?.length ?? 0;
  const sentValues = calls.data?.filter(c => c.sentimentAvg != null).map(c => c.sentimentAvg!) ?? [];
  const avgSent = sentValues.length ? sentValues.reduce((a, b) => a + b, 0) / sentValues.length : null;
  const topPrompt = promptTypes.data?.sort((a, b) => b.count - a.count)[0];
  const recent = (calls.data ?? []).slice(0, 8);
  const contactById = new Map<string, Contact>();
  for (const c of contacts.data ?? []) contactById.set(c.id, c);

  return (
    <div>
      <header className="page-head">
        <div className="titles">
          <span className="eyebrow">Today · Overview</span>
          <h1>Your <em>signal</em> at a glance</h1>
          <p className="subtitle">
            Recent calls, sentiment trend, and the prompt type that fired most. Tap a row to dive in.
          </p>
        </div>
      </header>

      <div className="stat-grid">
        <article className="stat stat-with-ring">
          <div>
            <div className="label"><SparkIcon size={11} /> Total calls</div>
            <div className="value">{total}<span className="unit">recorded</span></div>
            <div className="delta">
              <strong>{contacts.data?.length ?? 0}</strong> contacts in your CRM
            </div>
          </div>
        </article>

        <article className="stat stat-with-ring">
          <div>
            <div className="label"><TrendingIcon size={11} /> Avg sentiment</div>
            <div className="value">{avgSent != null ? Math.round(avgSent) : '—'}<span className="unit">/ 100</span></div>
            <div className="delta">
              <strong>{sentValues.length}</strong> calls with measured sentiment
            </div>
          </div>
          <SentimentRing value={avgSent} size={88} stroke={6} />
        </article>

        <article className="stat stat-with-ring">
          <div>
            <div className="label"><TargetIcon size={11} /> Top prompt</div>
            <div className="value">{topPrompt?.promptType ?? '—'}</div>
            <div className="delta">
              {topPrompt ? <><strong>{topPrompt.count}</strong> times triggered</> : 'No data yet'}
            </div>
          </div>
        </article>
      </div>

      <div className="section-head">
        <h2>Recent calls</h2>
        <span className="meta">Last {recent.length} sessions</span>
      </div>

      {recent.length === 0 ? (
        <div className="empty glass">
          <div className="glyph"><SparkIcon /></div>
          <p>No calls yet. Open a meeting and SIGNAL will appear here.</p>
        </div>
      ) : (
        <ul className="call-list">
          {recent.map(c => (
            <CallRow
              key={c.id}
              call={c}
              contact={c.contactId ? contactById.get(c.contactId) : undefined}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function CallRow({ call, contact }: { call: CallSession; contact?: Contact }) {
  return (
    <li>
      <Link to={`/calls/${call.id}`} className="call-row">
        <SentimentRing value={call.sentimentAvg} size={42} stroke={4} />
        <div className="who">
          <span className="name">{contact?.name ?? 'Unknown prospect'}</span>
          <span className="sub">{contact?.company ?? call.platform}</span>
        </div>
        <span className={`tag ${TYPE_TAG[call.callType] ?? ''}`}>{call.callType}</span>
        <span className="duration">
          {call.durationMs ? `${Math.round(call.durationMs / 60000)} min` : '—'}
        </span>
        <span className="when">{formatWhen(call.startedAt)}</span>
        <span className="arrow"><ArrowRightIcon /></span>
      </Link>
    </li>
  );
}
