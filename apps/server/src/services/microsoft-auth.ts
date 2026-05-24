import { fetchWithTimeout, isBlank } from './google-auth.js';

export const MICROSOFT_TOKEN_TIMEOUT_MS = 10_000;

export interface MicrosoftRefreshOpts {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  tenantId?: string;
  scope: string;
}

export async function refreshMicrosoftAccessToken(
  opts: MicrosoftRefreshOpts,
  label = 'Microsoft Graph',
): Promise<string | null> {
  if (isBlank(opts.clientId) || isBlank(opts.clientSecret) || isBlank(opts.refreshToken)) {
    return null;
  }
  const tenant = opts.tenantId && opts.tenantId.trim() !== '' ? opts.tenantId : 'common';
  const url = `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`;
  try {
    const body = new URLSearchParams({
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
      refresh_token: opts.refreshToken,
      grant_type: 'refresh_token',
      scope: opts.scope,
    });
    const res = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      },
      MICROSOFT_TOKEN_TIMEOUT_MS,
    );
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      console.error(`[SIGNAL] ${label} token refresh failed:`, res.status, txt);
      return null;
    }
    const data = (await res.json()) as { access_token?: string };
    return data.access_token ?? null;
  } catch (err) {
    console.error(`[SIGNAL] ${label} token refresh failed:`, err);
    return null;
  }
}
