import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchRecentOutlookSentEmails, refreshOutlookAccessToken } from './outlook.js';

describe('refreshOutlookAccessToken', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns null for blank credentials', async () => {
    const token = await refreshOutlookAccessToken({
      clientId: '',
      clientSecret: '',
      refreshToken: '',
    });
    expect(token).toBeNull();
  });

  it('posts refresh-token grant to Microsoft identity platform', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'ms-access-token' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const token = await refreshOutlookAccessToken({
      clientId: 'client-id',
      clientSecret: 'client-secret',
      refreshToken: 'refresh-token',
      tenantId: 'common',
    });

    expect(token).toBe('ms-access-token');
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('https://login.microsoftonline.com/common/oauth2/v2.0/token');
    const body = new URLSearchParams(opts.body as string);
    expect(body.get('grant_type')).toBe('refresh_token');
    expect(body.get('scope')).toContain('Mail.Read');
  });
});

describe('fetchRecentOutlookSentEmails', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads Sent Items messages and normalizes bodies', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        value: [
          {
            subject: 'Next steps',
            sentDateTime: '2026-05-22T12:00:00Z',
            body: { contentType: 'text', content: 'Great speaking today.' },
          },
          {
            subject: 'Deck',
            sentDateTime: '2026-05-21T12:00:00Z',
            body: { contentType: 'html', content: '<p>Sharing the deck &amp; notes.</p>' },
          },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const samples = await fetchRecentOutlookSentEmails({
      accessToken: 'access-token',
      limit: 2,
    });

    expect(samples).toEqual([
      {
        subject: 'Next steps',
        body: 'Great speaking today.',
        sentAt: Date.parse('2026-05-22T12:00:00Z'),
      },
      {
        subject: 'Deck',
        body: 'Sharing the deck & notes.',
        sentAt: Date.parse('2026-05-21T12:00:00Z'),
      },
    ]);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toContain("/me/mailFolders('SentItems')/messages");
    expect(url).toContain('%24select=subject%2CbodyPreview%2Cbody%2CsentDateTime');
    expect(opts.headers.Authorization).toBe('Bearer access-token');
    expect(opts.headers.Prefer).toBe('outlook.body-content-type="text"');
  });
});
