import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import ContactDetail from './ContactDetail';
import { json, mockFetch, renderAt } from '../test/utils';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const contact = {
  id: 'c1', name: 'Ada Lovelace', email: null, linkedinUrl: null, company: 'Acme',
  role: null, notes: null, createdAt: 1, updatedAt: 1,
};
const calls = [
  { id: 's1', contactId: 'c1', platform: 'meet', callType: 'investor', startedAt: 2000, endedAt: null, durationMs: null, sentimentAvg: null },
  { id: 's2', contactId: 'c1', platform: 'zoom', callType: 'investor', startedAt: 1000, endedAt: null, durationMs: null, sentimentAvg: null },
];
const summary = (objections: string[]) => ({
  winSignals: [], objections, decisions: [], followUpDraft: '', createdAt: 1, scorecard: null,
});

function routes(url: string, init?: RequestInit): Response {
  if (url === '/api/contacts/c1' && init?.method === 'PUT') return json({ ...contact, company: 'Acme 2' });
  if (url === '/api/contacts/c1') return json(contact);
  if (url === '/api/calls') return json(calls);
  if (url === '/api/contacts/c1/objections') return json([{ objection: 'Price', count: 1 }]);
  if (url === '/api/calls/s1/summary') return json(summary(['Price']));
  if (url === '/api/calls/s2/summary') return json({ error: 'not found' }, 404);
  if (url === '/api/octamem/query') return json({ context: null });
  return json({ error: 'not found' }, 404);
}

describe('ContactDetail page', () => {
  it('shows "Contact not found" for an unknown id', async () => {
    mockFetch(() => json({ error: 'not found' }, 404));
    renderAt(<ContactDetail />, { path: '/contacts/:id', url: '/contacts/missing' });
    expect((await screen.findByRole('alert')).textContent).toMatch('Contact not found');
  });

  it('saves without sending blank email/linkedinUrl (rejected by the server)', async () => {
    const fetches = mockFetch(routes);
    renderAt(<ContactDetail />, { path: '/contacts/:id', url: '/contacts/c1' });
    await screen.findByRole('heading', { name: 'Ada Lovelace' });

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await screen.findByText('Contact saved');
    const put = fetches.find(c => c.init?.method === 'PUT');
    expect(JSON.parse(String(put?.init?.body))).toEqual({ company: 'Acme', role: '', notes: '' });
  });

  it('filters calls by the clicked objection', async () => {
    mockFetch(routes);
    renderAt(<ContactDetail />, { path: '/contacts/:id', url: '/contacts/c1' });
    await screen.findByText('2 sessions');
    Element.prototype.scrollIntoView = () => {};

    fireEvent.click(await screen.findByRole('button', { name: /Price/ }));

    await waitFor(() => expect(screen.getByText('1 of 2 sessions')).toBeTruthy());
    expect(screen.getAllByRole('link').filter(a => a.getAttribute('href')?.startsWith('/calls/')))
      .toHaveLength(1);
  });
});
