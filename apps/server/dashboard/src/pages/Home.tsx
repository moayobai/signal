import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import {
  api,
  type CoachAnalytics,
  type Contact,
  type CallSession,
  type UpcomingMeeting,
} from '../lib/api';
import { SentimentRing } from '../components/SentimentRing';
import { ArrowRightIcon, TrendingIcon, SparkIcon, TargetIcon } from '../components/icons';

interface TrendPoint {
  week: string;
  avg: number;
  count: number;
}

interface PreCallBrief {
  objective: string;
  opener: string;
  likelyObjection: string;
  mustSecure: string;
  proofPoint: string;
}

function buildSparkPath(
  points: TrendPoint[],
  w: number,
  h: number,
  pad = 4,
): { line: string; area: string } {
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
    <svg
      className="sparkline"
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
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
  investor: 'tag-investor',
  enterprise: 'tag-enterprise',
  bd: 'tag-bd',
  customer: 'tag-customer',
};

function formatWhen(ts: number): string {
  const d = new Date(ts);
  return (
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ' · ' +
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  );
}

function signed(n: number | null): string {
  if (n == null) return 'baseline pending';
  if (n === 0) return 'flat';
  return `${n > 0 ? '+' : ''}${n}`;
}

function callTypeLabel(type: string): string {
  if (type === 'bd') return 'BD';
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function firstName(name: string | undefined): string {
  return name?.split(' ').filter(Boolean)[0] ?? 'them';
}

function meetingPersona(meeting: UpcomingMeeting, contact: Contact | undefined): string {
  const text = `${meeting.title} ${contact?.role ?? ''} ${contact?.company ?? ''}`.toLowerCase();
  if (text.includes('investor') || text.includes('venture') || text.includes('fund')) {
    return 'investor';
  }
  if (text.includes('customer') || text.includes('renewal')) return 'customer';
  if (text.includes('partner') || text.includes('bd')) return 'partner';
  return 'buyer';
}

function buildPreCallBrief(
  meeting: UpcomingMeeting,
  contact: Contact | undefined,
  coach: CoachAnalytics | null,
): PreCallBrief {
  const persona = meetingPersona(meeting, contact);
  const name = firstName(contact?.name ?? meeting.attendees.find(a => !a.isOrganizer)?.name);
  const friction = coach?.topObjection?.objection ?? 'unclear decision criteria';
  const weak = coach?.weakestDimension?.label ?? 'mutual action plan';
  const objective =
    persona === 'investor'
      ? 'Prove the compounding loop and secure the next diligence step.'
      : persona === 'partner'
        ? 'Turn interest into a named owner, commercial motion, and launch date.'
        : persona === 'customer'
          ? 'Confirm success criteria, risk, and the next production commitment.'
          : 'Lock the business outcome, owner, date, and success metric.';
  return {
    objective,
    opener: `${name}, before I show anything, what would make this conversation a clear win for you?`,
    likelyObjection: friction,
    mustSecure: 'Owner, date, success metric, and the next calendar hold.',
    proofPoint: `Bring proof that addresses ${friction.toLowerCase()} and make ${weak.toLowerCase()} explicit.`,
  };
}

function CoachFocusCard({ coach, loading }: { coach: CoachAnalytics | null; loading: boolean }) {
  const focus = coach?.focus;
  return (
    <article className="command-card focus-card">
      <div className="label">
        <SparkIcon size={11} /> Next edge
      </div>
      {focus ? (
        <>
          <div className="focus-main">
            <h2>{focus.title}</h2>
            <span>{focus.metric}</span>
          </div>
          <p>{focus.rationale}</p>
          <div className="focus-action">{focus.action}</div>
        </>
      ) : (
        <>
          <div className="focus-main">
            <h2>{loading ? 'Reading the loop' : 'First call pending'}</h2>
            <span>—</span>
          </div>
          <p>Complete a call to establish the first coaching baseline.</p>
          <div className="focus-action">Start with a sales or investor conversation.</div>
        </>
      )}
    </article>
  );
}

function LoopCard({ coach }: { coach: CoachAnalytics | null }) {
  const loop = coach?.loop ?? [
    { label: 'Capture', value: 0, detail: 'Calls' },
    { label: 'Coach', value: 0, detail: 'Scorecards' },
    { label: 'Compound', value: 0, detail: 'Patterns' },
  ];
  return (
    <article className="command-card loop-card">
      <div className="label">
        <TrendingIcon size={11} /> Feedback loop
      </div>
      <div className="loop-rail">
        {loop.map((item, index) => (
          <div className="loop-step" key={item.label}>
            <span className="loop-index">{index + 1}</span>
            <div>
              <strong>{item.label}</strong>
              <span>{item.value}</span>
            </div>
            <p>{item.detail}</p>
          </div>
        ))}
      </div>
    </article>
  );
}

export default function Home() {
  const calls = useQuery({ queryKey: ['calls'], queryFn: api.calls });
  const contacts = useQuery({ queryKey: ['contacts'], queryFn: api.contacts });
  const trend = useQuery({ queryKey: ['sentiment-trend'], queryFn: api.sentimentTrend });
  const coach = useQuery({ queryKey: ['coach-analytics'], queryFn: api.coach });
  const nextMeeting = useQuery({
    queryKey: ['next-meeting'],
    queryFn: api.nextMeeting,
    refetchInterval: 60_000,
  });
  const trendPoints = (trend.data ?? []).slice(-6);

  const total = calls.data?.length ?? 0;
  const sentValues =
    calls.data?.filter(c => c.sentimentAvg != null).map(c => c.sentimentAvg!) ?? [];
  const avgSent = sentValues.length
    ? sentValues.reduce((a, b) => a + b, 0) / sentValues.length
    : null;

  const talkValues = calls.data?.filter(c => c.talkRatio != null).map(c => c.talkRatio!) ?? [];
  const avgTalk = talkValues.length
    ? talkValues.reduce((a, b) => a + b, 0) / talkValues.length
    : null;
  const talkPct = avgTalk != null ? Math.round(avgTalk * 100) : null;
  const talkColor =
    talkPct == null
      ? undefined
      : talkPct > 65
        ? '#ef4444'
        : talkPct > 55
          ? '#f5a524'
          : talkPct >= 35
            ? '#22c55e'
            : '#f5a524';

  const recent = (calls.data ?? []).slice(0, 8);
  const contactById = new Map<string, Contact>();
  for (const c of contacts.data ?? []) contactById.set(c.id, c);
  const coachData = coach.data ?? null;
  const methodScore = coachData?.averages.score ?? null;

  return (
    <div>
      <header className="page-head command-head">
        <div className="titles">
          <span className="eyebrow">Command center</span>
          <h1>
            Win the next <em>conversation</em>
          </h1>
          <p className="subtitle">
            Every call sharpens the next prep, live cue, follow-up, and coaching edge.
          </p>
        </div>
      </header>

      <section className="command-grid">
        <CoachFocusCard coach={coachData} loading={coach.isLoading} />
        <LoopCard coach={coachData} />
        <NextMeetingCard
          meeting={nextMeeting.data ?? null}
          contacts={contacts.data ?? []}
          coach={coachData}
        />
      </section>

      <div className="stat-grid">
        <article className="stat stat-with-ring">
          <div>
            <div className="label">
              <SparkIcon size={11} /> Total calls
            </div>
            <div className="value">
              {total}
              <span className="unit">recorded</span>
            </div>
            <div className="delta">
              <strong>{coachData?.windowSize ?? total}</strong> in coaching window
            </div>
          </div>
        </article>

        <article className="stat">
          <div className="label">
            <TrendingIcon size={11} /> Sentiment trend
          </div>
          <div
            className={`value ${avgSent == null ? 'metric-empty' : ''}`}
            style={{ fontSize: 36 }}
          >
            {avgSent != null ? Math.round(avgSent) : 'No read'}
            {avgSent != null && <span className="unit">/ 100 avg</span>}
          </div>
          {trendPoints.length > 0 ? (
            <Sparkline points={trendPoints} />
          ) : (
            <div className="skel-text" style={{ marginTop: 10, height: 48 }} />
          )}
          <div className="delta">
            <strong>{signed(coachData?.averages.sentimentDelta ?? null)}</strong> last 5 vs prior
          </div>
        </article>

        <article className="stat stat-with-ring">
          <div>
            <div className="label">
              <TargetIcon size={11} /> Method score
            </div>
            <div className={`value ${methodScore == null ? 'metric-empty' : ''}`}>
              {methodScore != null ? methodScore : 'No score'}
              {methodScore != null && <span className="unit">/ 100</span>}
            </div>
            <div className="delta">
              <strong>{signed(coachData?.averages.scoreDelta ?? null)}</strong> last 5 vs prior
            </div>
          </div>
        </article>

        <article className="stat stat-with-ring">
          <div>
            <div className="label">
              <TargetIcon size={11} /> Buyer-led time
            </div>
            <div
              className={`value ${talkPct == null ? 'metric-empty' : ''}`}
              style={talkColor ? { color: talkColor } : undefined}
            >
              {talkPct != null ? `${talkPct}%` : 'No read'}
              {talkPct != null && <span className="unit">you</span>}
            </div>
            <div className="delta">
              <strong>{coachData?.averages.longestMonologueSec ?? '—'}s</strong> avg monologue
            </div>
          </div>
        </article>
      </div>

      <div className="edge-grid">
        <article className="edge-card">
          <div className="label">Call mix</div>
          <div className="mix-list">
            {(coachData?.callTypeMix ?? []).length > 0 ? (
              coachData!.callTypeMix.map(item => (
                <div className="mix-row" key={item.callType}>
                  <span>{callTypeLabel(item.callType)}</span>
                  <strong>{item.count}</strong>
                </div>
              ))
            ) : (
              <p className="empty-copy">No mix yet.</p>
            )}
          </div>
        </article>
        <article className="edge-card">
          <div className="label">Recurring friction</div>
          <h3>{coachData?.topObjection?.objection ?? 'No recurring objection yet'}</h3>
          <p>
            {coachData?.topObjection
              ? `${coachData.topObjection.count} calls surfaced this objection.`
              : 'The pattern will appear after more completed debriefs.'}
          </p>
        </article>
        <article className="edge-card">
          <div className="label">Live cue pattern</div>
          <h3>{coachData?.topPromptType?.promptType ?? 'Awaiting cues'}</h3>
          <p>
            {coachData?.topPromptType
              ? `${coachData.topPromptType.count} cues in the coaching window.`
              : 'Live coaching history will build from upcoming calls.'}
          </p>
        </article>
      </div>

      <div className="section-head">
        <h2>Recent calls</h2>
        <span className="meta">Last {recent.length} sessions</span>
      </div>

      {recent.length === 0 ? (
        <div className="empty glass">
          <div className="glyph">
            <SparkIcon />
          </div>
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

function minutesFromNow(ts: number): number {
  return Math.max(0, Math.round((ts - Date.now()) / 60000));
}

function NextMeetingCard({
  meeting,
  contacts,
  coach,
}: {
  meeting: UpcomingMeeting | null;
  contacts: Contact[];
  coach: CoachAnalytics | null;
}) {
  const navigate = useNavigate();
  if (!meeting) {
    return (
      <article className="command-card meeting-card empty-meeting">
        <div className="label">Next meeting</div>
        <h2>No meeting queued</h2>
        <p>Calendar prep is clear for the next hour.</p>
      </article>
    );
  }

  const mins = minutesFromNow(meeting.startTime);
  const primary = meeting.attendees.find(a => !a.isOrganizer) ?? meeting.attendees[0];
  const shown = meeting.attendees.slice(0, 3);
  const matched = primary?.email
    ? contacts.find(c => c.email?.toLowerCase() === primary.email.toLowerCase())
    : undefined;
  const brief = buildPreCallBrief(meeting, matched, coach);

  return (
    <article className="command-card meeting-card">
      <div className="meeting-copy">
        <div className="label">
          Next meeting · {meeting.provider === 'google' ? 'Google' : 'Outlook'}
        </div>
        <h2>{meeting.title}</h2>
        <p>
          Starts in <strong>{mins}</strong> min · {shown.map(a => a.name ?? a.email).join(', ')}
          {meeting.attendees.length > shown.length
            ? ` +${meeting.attendees.length - shown.length}`
            : ''}
        </p>
        <div className="precall-brief">
          <div className="brief-row">
            <span>Objective</span>
            <strong>{brief.objective}</strong>
          </div>
          <div className="brief-row">
            <span>Opener</span>
            <strong>{brief.opener}</strong>
          </div>
          <div className="brief-row">
            <span>Likely pushback</span>
            <strong>{brief.likelyObjection}</strong>
          </div>
          <div className="brief-row">
            <span>Must secure</span>
            <strong>{brief.mustSecure}</strong>
          </div>
          <div className="brief-row">
            <span>Proof point</span>
            <strong>{brief.proofPoint}</strong>
          </div>
        </div>
      </div>
      <div className="meeting-actions">
        {meeting.meetingLink && (
          <a href={meeting.meetingLink} target="_blank" rel="noreferrer" className="pill active">
            Join
          </a>
        )}
        <button
          className="pill"
          disabled={!matched}
          onClick={() => matched && navigate(`/contacts/${matched.id}`)}
          title={matched ? `Open ${matched.name}` : 'No matching contact'}
        >
          Prepare
        </button>
      </div>
    </article>
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
        <span className="arrow">
          <ArrowRightIcon />
        </span>
      </Link>
    </li>
  );
}
