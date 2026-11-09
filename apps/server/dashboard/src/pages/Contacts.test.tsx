import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import Contacts from './Contacts';
import { json, mockFetch, renderAt, stubDialog } from '../test/utils';

beforeAll(stubDialog);
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function openAndFill(name: string) {
  fireEvent.click(screen.getByRole('button', { name: /new contact/i }));
  fireEvent.change(screen.getByPlaceholderText('James Carter'), { target: { value: name } });
  fireEvent.click(screen.getByRole('button', { name: /create contact/i }));
}

describe('Contacts page', () => {
  it('creates a contact without sending blank email/linkedinUrl', async () => {
    const calls = mockFetch((url, init) => {
      if (init?.method === 'POST') return json({ id: 'c1', name: 'Ada', createdAt: 1, updatedAt: 1 }, 201);
      return json([]);
    });
    renderAt(<Contacts />, { path: '/contacts', url: '/contacts' });
    await screen.findByText('No contacts yet.');

    openAndFill('Ada Lovelace');

    await waitFor(() => expect(calls.some(c => c.init?.method === 'POST')).toBe(true));
    const post = calls.find(c => c.init?.method === 'POST');
    expect(JSON.parse(String(post?.init?.body))).toEqual({ name: 'Ada Lovelace' });
  });

  it('shows the server error when creation fails', async () => {
    mockFetch((url, init) => {
      if (init?.method === 'POST') {
        return json({ error: 'invalid body', details: [{ path: ['name'], message: 'Too big' }] }, 400);
      }
      return json([]);
    });
    renderAt(<Contacts />, { path: '/contacts', url: '/contacts' });
    await screen.findByText('No contacts yet.');

    openAndFill('Ada');

    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Invalid name: Too big');
  });

  it('shows a load error instead of an empty list', async () => {
    mockFetch(() => json({ error: 'unauthorized' }, 401));
    renderAt(<Contacts />, { path: '/contacts', url: '/contacts' });
    expect((await screen.findByRole('alert')).textContent).toMatch(/Unauthorised/);
  });

  it('matches search terms with surrounding whitespace', async () => {
    mockFetch(url => url.endsWith('/contacts')
      ? json([{ id: 'c1', name: 'Ada', company: 'Acme', createdAt: 1, updatedAt: 1 }])
      : json([]));
    renderAt(<Contacts />, { path: '/contacts', url: '/contacts?q=acme%20' });
    expect(await screen.findByRole('link', { name: 'Ada' })).toBeTruthy();
  });
});
