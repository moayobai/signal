import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { api } from '../lib/api';

export default function ContactDetail() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const contact = useQuery({ queryKey: ['contact', id], queryFn: () => api.contact(id) });
  const calls = useQuery({ queryKey: ['calls'], queryFn: api.calls });

  const [form, setForm] = useState({ company: '', role: '', email: '', linkedinUrl: '', notes: '' });
  useEffect(() => {
    if (contact.data) setForm({
      company: contact.data.company ?? '', role: contact.data.role ?? '',
      email: contact.data.email ?? '', linkedinUrl: contact.data.linkedinUrl ?? '',
      notes: contact.data.notes ?? '',
    });
  }, [contact.data]);

  const update = useMutation({
    mutationFn: (body: Partial<typeof form>) => api.updateContact(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contact', id] }),
  });

  const myCalls = calls.data?.filter(c => c.contactId === id) ?? [];

  if (!contact.data) return <div>Loading…</div>;
  return (
    <div>
      <h2>{contact.data.name}</h2>
      <form className="contact-form" onSubmit={e => { e.preventDefault(); update.mutate(form); }}>
        <label>Company <input value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} /></label>
        <label>Role <input value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} /></label>
        <label>Email <input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></label>
        <label>LinkedIn <input value={form.linkedinUrl} onChange={e => setForm({ ...form, linkedinUrl: e.target.value })} /></label>
        <label>Notes <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></label>
        <button type="submit">Save</button>
      </form>
      <h3>Calls ({myCalls.length})</h3>
      <ul>
        {myCalls.map(c => (
          <li key={c.id}>
            <a href={`/dashboard/calls/${c.id}`}>{new Date(c.startedAt).toLocaleString()}</a> — {c.callType}
            {c.sentimentAvg != null && ` · ${Math.round(c.sentimentAvg)}/100`}
          </li>
        ))}
      </ul>
    </div>
  );
}
