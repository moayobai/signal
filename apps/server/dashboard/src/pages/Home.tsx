import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, type Contact, type CallSession } from '../lib/api';
import { SentimentRing } from '../components/SentimentRing';
import { ArrowRightIcon, TrendingIcon, SparkIcon, TargetIcon } from '../components/icons';

interface TrendPoint { week: string; avg: number; count: number }

function buildSparkPath(points: TrendPoint[], w: number, h: number, pad = 4): { line: string; area: string } {
  if (points.length === 0) return { line: '', area: '' };
  const n = points.length;
  const xs = points.map((_, i) => pad + (i * (w - pad * 2)) / Math.max(1, n - 1));
  const ys = points.map(p => {
    const v = Math.max(0, Math.min(100, p.avg));
    return h - pad - (v / 100) * (h - pad * 2);
  });
  let line = `M ${xs[0].toFixed(2)} ${ys[0].toFixed(2)}`;
  for (let i = 0; i < n - 1; i++) {
    const x0 = xs[Math.max(0, i - 1)];
    const y0 = ys[Math.max(0, i - 1)];
    const x1 = xs[i];
    const y1 = ys[i];
    const x2 = xs[i + 1];
    const y2 = ys[i + 1];
    const x3 = xs[Math.min(n - 1, i + 2)];
    const y3 = ys[Math.min(n - 1, i + 2)];
    const cp1x = x1 + (x2 - x0) / 6;
    const cp1y = y1 + (y2 - y0) / 6;
    const cp2x = x2 - (x3 - x1) / 6;
    const cp2y = y2 - (y3 - y1) / 6;
    line += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${x2.toFixed(2)} ${y2.toFixed(2)}`;
  }
  const area = `${line} L ${xs[n - 1].toFixed(2)} ${h - pad} L ${xs[0].toFixed(2)} ${h - pad} Z`;
  return { line, area };
}

function Sparkline({ points }: { points: TrendPoint[] }) {
  const w = 180;
  const h = 48;
  const { line, area } = buildSparkPath(points, w, h);
  if (!line || points.length === 0) return null;
  const n = points.length;
  const lastX = 4 + ((n - 1) * (w - 8)) / Math.max(1, n - 1);
  const lastY = h - 4 - (Math.max(0, Math.min(100, points[n - 1].avg)) / 100) * (h - 8);
  return (
    <svg className="sparkline" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f5a524" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#f5a524" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path className="area" d={area} />
      <path className="line" d={line} />
      <circle className="dot" cx={lastX} cy={lastY} r={2.5} />
    </svg>
  );
}

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
  const trend = useQuery({ queryKey: ['sentiment-trend'], queryFn: api.sentimentTrend });
  const trendPoints = (trend.data ?? []).slice(-6);

  const total = calls.data?.length ?? 0;
  const sentValues = calls.data?.filter(c => c.sentimentAvg != null).map(c => c.sentimentAvg!) ?? [];
  const avgSent = sentValues.length ? sentValues.reduce((a, b) => a + b, 0) / sentValues.length : null;

  const now = Date.now();
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  const thisWeek = calls.data?.filter(c => now - c.startedAt < WEEK_MS).length ?? 0;
  const lastWeek = calls.data?.filter(c => {
    const age = now - c.startedAt;
    return age >= WEEK_MS && age < 2 * WEEK_MS;
  }).length ?? 0;

  const talkValues = calls.data?.filter(c => c.talkRatio != null).map(c => c.talkRatio!) ?? [];
  const avgTalk = talkValues.length ? talkValues.reduce((a, b) => a + b, 0) / talkValues.length : null;
  const talkPct = avgTalk != null ? Math.round(avgTalk * 100) : null;
  const talkColor = talkPct == null
    ? undefined
    : talkPct > 65 ? '#ef4444'
    : talkPct > 55 ? '#f5a524'
    : talkPct >= 35 ? '#22c55e'
    : '#f5a524';

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
            Recent calls, sentiment trend, and how active this week has been. Tap a row to dive in.
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

        <article className="stat">
          <div className="label"><TrendingIcon size={11} /> Sentiment trend</div>
          <div className="value" style={{ fontSize: 36 }}>
            {avgSent != null ? Math.round(avgSent) : '—'}
            <span className="unit">/ 100 avg</span>
          </div>
          {trendPoints.length > 0
            ? <Sparkline points={trendPoints} />
            : <div className="skel-text" style={{ marginTop: 10, height: 48 }} />}
          <div className="delta">
            <strong>{trendPoints.length}</strong> weeks · last {trendPoints.length} points
          </div>
        </article>

        <article className="stat stat-with-ring">
          <div>
            <div className="label"><TargetIcon size={11} /> Calls · this week</div>
            <div className="value">{thisWeek}<span className="unit">in last 7 days</span></div>
            <div className="delta">
              vs <strong>{lastWeek}</strong> last week
            </div>
          </div>
        </article>

        <article className="stat stat-with-ring">
          <div>
            <div className="label"><TargetIcon size={11} /> Avg talk time</div>
            <div className="value" style={talkColor ? { color: talkColor } : undefined}>
              {talkPct != null ? `${talkPct}%` : '—'}<span className="unit">you</span>
            </div>
            <div className="delta">
              <strong>{talkValues.length}</strong> calls measured · target 45%
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
