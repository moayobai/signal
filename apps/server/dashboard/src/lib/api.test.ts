import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, shouldRetry, toContactPayload } from './api';
import { json, mockFetch } from '../test/utils';

afterEach(() => { vi.unstubAllGlobals(); });

describe('toContactPayload', () => {
  const blank = { name: 'Ada', company: '', role: '', email: '', linkedinUrl: '', notes: '' };

  it('omits blank fields on create so zod email()/url() validation does not 400', () => {
    expect(toContactPayload(blank, 'create')).toEqual({ name: 'Ada' });
  });

  it('trims values', () => {
    expect(toContactPayload({ name: '  Ada ', email: ' ada@x.io ' }, 'create'))
      .toEqual({ name: 'Ada', email: 'ada@x.io' });
  });

  it('sends blank free-text fields as "" on update (to clear) but never blank email/url', () => {
    const { name: _name, ...rest } = blank;
    expect(toContactPayload(rest, 'update')).toEqual({ company: '', role: '', notes: '' });
  });
});

describe('api client', () => {
  it('url-encodes ids in paths', async () => {
    const calls = mockFetch(() => json({ id: 'a/b' }));
    await api.contact('a/b?x');
    expect(calls[0].url).toBe('/api/contacts/a%2Fb%3Fx');
  });

  it('maps 404 on a call to a friendly ApiError', async () => {
    mockFetch(() => json({ error: 'not found' }, 404));
    await expect(api.call('nope')).rejects.toMatchObject({ status: 404, message: 'Call not found' });
  });

  it('surfaces the first zod issue on 400', async () => {
    mockFetch(() => json({
      error: 'invalid body',
      details: [{ path: ['email'], message: 'Invalid email address' }],
    }, 400));
    await expect(api.createContact({ name: 'x', email: 'bad' }))
      .rejects.toThrow('Invalid email: Invalid email address');
  });

  it('falls back to a generic message when a 400 body is not JSON', async () => {
    mockFetch(() => new Response('nope', { status: 400 }));
    await expect(api.contacts()).rejects.toThrow('Invalid request');
  });

  it('returns null for an empty body instead of throwing a JSON parse error', async () => {
    mockFetch(() => new Response(null, { status: 204 }));
    await expect(api.nextMeeting()).resolves.toBeNull();
  });

  it('parses a JSON null body', async () => {
    mockFetch(() => json(null));
    await expect(api.nextMeeting()).resolves.toBeNull();
  });
});

describe('shouldRetry', () => {
  it('does not retry client errors', () => {
    expect(shouldRetry(0, new ApiError(404, 'x'))).toBe(false);
    expect(shouldRetry(0, new ApiError(401, 'x'))).toBe(false);
  });

  it('retries server errors, rate limits and network failures up to 3 times', () => {
    expect(shouldRetry(0, new ApiError(500, 'x'))).toBe(true);
    expect(shouldRetry(0, new ApiError(429, 'x'))).toBe(true);
    expect(shouldRetry(2, new TypeError('Failed to fetch'))).toBe(true);
    expect(shouldRetry(3, new TypeError('Failed to fetch'))).toBe(false);
  });
});
