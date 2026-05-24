import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { api, type Contact, type CallSession } from '../lib/api';
import { Modal } from '../components/Modal';
import { SentimentRing } from '../components/SentimentRing';
import { SearchIcon, PlusIcon, ChevronUp, ChevronDown, CloseIcon } from '../components/icons';

type SortKey = 'name' | 'company' | 'role' | 'lastCalled' | 'callCount' | 'sentiment';
type SortDir = 'asc' | 'desc';

const VALID_SORT_KEYS: SortKey[] = [
  'name',
  'company',
  'role',
  'lastCalled',
  'callCount',
  'sentiment',
];

interface Row {
  contact: Contact;
  callCount: number;
  lastCalledAt: number | null;
  avgSentiment: number | null;
}

function buildRows(contacts: Contact[], calls: CallSession[]): Row[] {
  const byContact = new Map<string, CallSession[]>();
  for (const c of calls) {
    if (!c.contactId) continue;
    const arr = byContact.get(c.contactId) ?? [];
    arr.push(c);
    byContact.set(c.contactId, arr);
  }
  return contacts.map(contact => {
    const sessions = byContact.get(contact.id) ?? [];
    const sentVals = sessions.map(s => s.sentimentAvg).filter((s): s is number => s != null);
    return {
      contact,
      callCount: sessions.length,
      lastCalledAt: sessions.length > 0 ? Math.max(...sessions.map(s => s.startedAt)) : null,
      avgSentiment:
        sentVals.length > 0 ? sentVals.reduce((a, b) => a + b, 0) / sentVals.length : null,
    };
  });
}

export default function Contacts() {
  const qc = useQueryClient();
  const contactsQ = useQuery({ queryKey: ['contacts'], queryFn: api.contacts });
  const callsQ = useQuery({ queryKey: ['calls'], queryFn: api.calls });

  // URL-backed state: search, sort and direction persist across navigation and are shareable.
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get('q') ?? '';
  const urlSortKey = searchParams.get('sort') as SortKey | null;
  const sortKey: SortKey =
    urlSortKey && VALID_SORT_KEYS.includes(urlSortKey) ? urlSortKey : 'lastCalled';
  const sortDir: SortDir = searchParams.get('dir') === 'asc' ? 'asc' : 'desc';
  const [modalOpen, setModalOpen] = useState(false);

  function setSearch(q: string): void {
    setSearchParams(
      prev => {
        const next = new URLSearchParams(prev);
        if (q) next.set('q', q);
        else next.delete('q');
        return next;
      },
      { replace: true },
    );
  }
  function setSort(key: SortKey, dir: SortDir): void {
    setSearchParams(
      prev => {
        const next = new URLSearchParams(prev);
        next.set('sort', key);
        next.set('dir', dir);
        return next;
      },
      { replace: true },
    );
  }

  const rows = useMemo(() => {
    if (!contactsQ.data || !callsQ.data) return [];
    let r = buildRows(contactsQ.data, callsQ.data);
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter(
        ({ contact: c }) =>
          c.name.toLowerCase().includes(q) ||
          (c.company ?? '').toLowerCase().includes(q) ||
          (c.role ?? '').toLowerCase().includes(q) ||
          (c.email ?? '').toLowerCase().includes(q),
      );
    }
    const dir = sortDir === 'asc' ? 1 : -1;
    r.sort((a, b) => {
      const A = sortVal(a, sortKey);
      const B = sortVal(b, sortKey);
      if (A == null && B == null) return 0;
      if (A == null) return 1;
      if (B == null) return -1;
      if (A < B) return -1 * dir;
      if (A > B) return 1 * dir;
      return 0;
    });
    return r;
  }, [contactsQ.data, callsQ.data, search, sortKey, sortDir]);

  const create = useMutation({
    mutationFn: (body: Partial<Contact>) => api.createContact(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contacts'] });
      setModalOpen(false);
    },
  });

  function toggleSort(k: SortKey) {
    if (k === sortKey) {
      setSort(k, sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSort(k, k === 'name' || k === 'company' || k === 'role' ? 'asc' : 'desc');
    }
  }

  return (
    <div>
      <header className="page-head">
        <div className="titles">
          <span className="eyebrow">CRM · Directory</span>
          <h1>
            Your <em>contacts</em>
          </h1>
          <p className="subtitle">
            Everyone you've spoken with on a SIGNAL-monitored call. Editable, sortable, searchable.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setModalOpen(true)}>
          <PlusIcon size={14} /> New contact
        </button>
      </header>

      <div className="toolbar">
        <div className="search">
          <span className="icon">
            <SearchIcon />
          </span>
          <input
            placeholder="Search by name, company, role, email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <span className="muted" style={{ fontSize: 12 }}>
          {rows.length} / {contactsQ.data?.length ?? 0}
        </span>
      </div>

      <div className="table-card">
        <div className="t-head t-row">
          <SortHead label="Name" active={sortKey} dir={sortDir} k="name" onClick={toggleSort} />
          <SortHead
            label="Company"
            active={sortKey}
            dir={sortDir}
            k="company"
            onClick={toggleSort}
          />
          <SortHead label="Role" active={sortKey} dir={sortDir} k="role" onClick={toggleSort} />
          <SortHead
            label="Last called"
            active={sortKey}
            dir={sortDir}
            k="lastCalled"
            onClick={toggleSort}
          />
          <SortHead
            label="Calls"
            active={sortKey}
            dir={sortDir}
            k="callCount"
            onClick={toggleSort}
            className="right"
          />
          <SortHead
            label="Signal"
            active={sortKey}
            dir={sortDir}
            k="sentiment"
            onClick={toggleSort}
          />
        </div>

        {rows.length === 0 ? (
          <div className="empty">
            <p>No contacts match.</p>
          </div>
        ) : (
          rows.map(({ contact: c, callCount, lastCalledAt, avgSentiment }) => (
            <div className="t-row" key={c.id}>
              <span className="name">
                <Link to={`/contacts/${c.id}`}>{c.name}</Link>
              </span>
              <span className="meta">{c.company ?? '—'}</span>
              <span className="meta">{c.role ?? '—'}</span>
              <span className="last">{lastCalledAt ? relativeTime(lastCalledAt) : '—'}</span>
              <span className="muted right">{callCount}</span>
              <SentimentRing value={avgSentiment} size={28} stroke={3} />
            </div>
          ))
        )}
      </div>

      <NewContactModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={body => create.mutate(body)}
        pending={create.isPending}
      />
    </div>
  );
}

function sortVal(r: Row, k: SortKey): string | number | null {
  switch (k) {
    case 'name':
      return r.contact.name.toLowerCase();
    case 'company':
      return (r.contact.company ?? '').toLowerCase() || null;
    case 'role':
      return (r.contact.role ?? '').toLowerCase() || null;
    case 'lastCalled':
      return r.lastCalledAt;
    case 'callCount':
      return r.callCount;
    case 'sentiment':
      return r.avgSentiment;
  }
}

function SortHead({
  label,
  k,
  active,
  dir,
  onClick,
  className,
}: {
  label: string;
  k: SortKey;
  active: SortKey;
  dir: SortDir;
  onClick: (k: SortKey) => void;
  className?: string;
}) {
  const isActive = active === k;
  return (
    <span
      className={`${isActive ? 'sorted' : ''} ${className ?? ''}`}
      onClick={() => onClick(k)}
      role="button"
    >
      {label}
      <span className="sort-indicator">
        {dir === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
      </span>
    </span>
  );
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const days = Math.round(diff / 86_400_000);
  if (days < 1) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.round(days / 7)}w ago`;
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function NewContactModal({
  open,
  onClose,
  onSubmit,
  pending,
}: {
  open: boolean;
  onClose: () => void;
  pending: boolean;
  onSubmit: (body: Partial<Contact>) => void;
}) {
  const [form, setForm] = useState({
    name: '',
    company: '',
    role: '',
    email: '',
    linkedinUrl: '',
  });

  function reset() {
    setForm({ name: '', company: '', role: '', email: '', linkedinUrl: '' });
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
    >
      <form
        className="dialog-pad"
        onSubmit={e => {
          e.preventDefault();
          onSubmit(form);
        }}
      >
        <div className="dialog-head">
          <h2>New contact</h2>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            <CloseIcon />
          </button>
        </div>

        <div className="field-grid">
          <div className="field full">
            <label>Name</label>
            <input
              autoFocus
              required
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="James Carter"
            />
          </div>
          <div className="field">
            <label>Company</label>
            <input
              value={form.company}
              onChange={e => setForm({ ...form, company: e.target.value })}
              placeholder="Acme Ventures"
            />
          </div>
          <div className="field">
            <label>Role</label>
            <input
              value={form.role}
              onChange={e => setForm({ ...form, role: e.target.value })}
              placeholder="Managing Partner"
            />
          </div>
          <div className="field full">
            <label>Email</label>
            <input
              type="email"
              value={form.email}
              onChange={e => setForm({ ...form, email: e.target.value })}
              placeholder="james@acme.vc"
            />
          </div>
          <div className="field full">
            <label>LinkedIn URL</label>
            <input
              type="url"
              value={form.linkedinUrl}
              onChange={e => setForm({ ...form, linkedinUrl: e.target.value })}
              placeholder="https://linkedin.com/in/…"
            />
          </div>
        </div>

        <div className="dialog-foot">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={!form.name || pending}>
            {pending ? 'Creating…' : 'Create contact'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
