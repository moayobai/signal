import { Link, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, useMemo } from 'react';
import { api, type CallSession } from '../lib/api';
import { SentimentRing } from '../components/SentimentRing';
import { ArrowRightIcon, SparkIcon, WarnIcon, CloseIcon } from '../components/icons';

const TYPE_TAG: Record<string, string> = {
  investor: 'tag-investor', enterprise: 'tag-enterprise',
  bd: 'tag-bd', customer: 'tag-customer',
};

function initials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

function formatWhen(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ContactDetail() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const contactQ = useQuery({ queryKey: ['contact', id], queryFn: () => api.contact(id) });
  const callsQ   = useQuery({ queryKey: ['calls'], queryFn: api.calls });
  const objQ     = useQuery({ queryKey: ['contact-obj', id], queryFn: () => api.contactObjections(id) });

  const [form, setForm] = useState({ company: '', role: '', email: '', linkedinUrl: '', notes: '' });
  useEffect(() => {
    if (contactQ.data) setForm({
      company: contactQ.data.company ?? '',
      role: contactQ.data.role ?? '',
      email: contactQ.data.email ?? '',
      linkedinUrl: contactQ.data.linkedinUrl ?? '',
      notes: contactQ.data.notes ?? '',
    });
  }, [contactQ.data]);

  const [toast, setToast] = useState(false);
  const [filterObjection, setFilterObjection] = useState<string | null>(null);

  const update = useMutation({
    mutationFn: (body: Partial<typeof form>) => api.updateContact(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contact', id] });
      setToast(true);
      setTimeout(() => setToast(false), 2500);
    },
  });

  const myCalls = useMemo<CallSession[]>(
    () => (callsQ.data ?? []).filter(c => c.contactId === id)
      .sort((a, b) => b.startedAt - a.startedAt),
    [callsQ.data, id]
  );
  const sentVals = myCalls.map(c => c.sentimentAvg).filter((s): s is number => s != null);
  const avgSent = sentVals.length ? sentVals.reduce((a, b) => a + b, 0) / sentVals.length : null;

  // OctaMem live query (returns null with placeholder key — graceful)
  const octaQ = useQuery({
    queryKey: ['octamem', id, contactQ.data?.name, contactQ.data?.company],
    queryFn: () => api.octamemQuery({
      name: contactQ.data!.name,
      company: contactQ.data?.company,
    }),
    enabled: !!contactQ.data?.name,
    retry: false,
    staleTime: 30_000,
  });

  if (!contactQ.data) {
    return (
      <div>
        <header className="page-head"><div className="skel-title" /></header>
        <div className="skel-card" />
      </div>
    );
  }
  const contact = contactQ.data;

  return (
    <div>
      <header className="page-head">
        <div className="contact-hero">
          <div className="avatar">{initials(contact.name)}</div>
          <div>
            <span className="eyebrow">Contact</span>
            <h1>{contact.name}</h1>
            <div className="meta">
              {contact.role && <>{contact.role}</>}
              {contact.role && contact.company && <> · </>}
              {contact.company && <>{contact.company}</>}
            </div>
          </div>
        </div>
        <SentimentRing value={avgSent} size={72} stroke={5} />
      </header>

      <div className="detail-grid">
        {/* Left column: editor + calls */}
        <div>
          <form className="glass" style={{ padding: 24 }}
            onSubmit={(e) => { e.preventDefault(); update.mutate(form); }}>
            <div className="field-grid">
              <div className="field">
                <label>Company</label>
                <input value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} />
              </div>
              <div className="field">
                <label>Role</label>
                <input value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} />
              </div>
              <div className="field">
                <label>Email</label>
                <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="field">
                <label>LinkedIn</label>
                <input type="url" value={form.linkedinUrl} onChange={e => setForm({ ...form, linkedinUrl: e.target.value })} />
              </div>
              <div className="field full">
                <label>Notes</label>
                <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18, gap: 10 }}>
              <button type="submit" className="btn btn-primary" disabled={update.isPending}>
                {update.isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>

          <div className="section-head" id="calls-section">
            <h2>Calls</h2>
            <span className="meta">{myCalls.length} sessions</span>
          </div>

          {filterObjection && (
            <div style={{ marginBottom: 12 }}>
              <button
                type="button"
                className="filter-pill"
                onClick={() => setFilterObjection(null)}
                title="Clear objection filter"
              >
                <span>Filtered: {filterObjection}</span>
                <span className="x"><CloseIcon size={11} /></span>
              </button>
            </div>
          )}

          {myCalls.length === 0 ? (
            <div className="empty glass"><p>No calls with this contact yet.</p></div>
          ) : (
            <ul className="contact-calls">
              {myCalls.map(c => (
                <li key={c.id}>
                  <Link to={`/calls/${c.id}`} className="call-row">
                    <SentimentRing value={c.sentimentAvg} size={42} stroke={4} />
                    <div className="who">
                      <span className="name">{formatWhen(c.startedAt)}</span>
                      <span className="sub">{c.platform}</span>
                    </div>
                    <span className={`tag ${TYPE_TAG[c.callType] ?? ''}`}>{c.callType}</span>
                    <span className="duration">
                      {c.durationMs ? `${Math.round(c.durationMs / 60000)} min` : '—'}
                    </span>
                    <span className="when">
                      {new Date(c.startedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                    </span>
                    <span className="arrow"><ArrowRightIcon /></span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Right column: OctaMem panel + objections aggregation */}
        <div className="side-stack">
          <article className="octamem">
            <div className="head">
              <SparkIcon size={11} /> What SIGNAL remembers
            </div>
            <div className="body">
              {octaQ.isLoading
                ? <div className="skel-text" style={{ marginBottom: 8 }} />
                : octaQ.data?.context
                  ? octaQ.data.context
                  : <span className="empty">
                      No prior memory yet. Once you complete calls with {contact.name.split(' ')[0]},
                      OctaMem will surface what worked and what didn't.
                    </span>}
            </div>
          </article>

          <article className="objections-card">
            <div className="head">
              <h3>Top objections</h3>
              <span className="meta"><WarnIcon size={11} /> Across all calls</span>
            </div>

            {objQ.data && objQ.data.length > 0 ? (
              <div>
                {objQ.data.slice(0, 6).map((o, i) => {
                  const max = objQ.data![0].count;
                  const pct = (o.count / max) * 100;
                  return (
                    <button
                      type="button"
                      className="obj-row"
                      key={i}
                      title="Click to filter calls (coming soon)"
                      onClick={() => {
                        setFilterObjection(o.objection);
                        document.getElementById('calls-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }}
                    >
                      <div className="label">
                        <span className="text">{o.objection}</span>
                      </div>
                      <div className="row-flex">
                        <div className="obj-bar"><div className="fill" style={{ width: `${pct}%` }} /></div>
                        <span className="count">{o.count}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="empty" style={{ padding: '20px 0' }}>
                <p>No objections recorded yet.</p>
              </div>
            )}
          </article>
        </div>
      </div>
      {toast && (
        <div className="toast" role="status">
          <span className="dot" />
          <span>Contact saved</span>
        </div>
      )}
    </div>
  );
}
