/**
 * Shared Google OAuth helpers. Both Gmail and Calendar use the same
 * refresh-token grant against oauth2.googleapis.com — DRY it up here so a
 * fix in one place lands everywhere.
 */

export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const GOOGLE_OAUTH_TIMEOUT_MS = 10_000;

export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  ms: number,
): Promise<Response> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ac.signal });
  } finally {
    clearTimeout(timer);
  }
}

export function isBlank(v: string | undefined): boolean {
  return !v || v.trim() === '' || v.startsWith('your-');
}

export interface GoogleRefreshOpts {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export async function refreshGoogleAccessToken(
  opts: GoogleRefreshOpts,
  label = 'Google',
): Promise<string | null> {
  if (isBlank(opts.clientId) || isBlank(opts.clientSecret) || isBlank(opts.refreshToken)) {
    return null;
  }
  try {
    const body = new URLSearchParams({
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
      refresh_token: opts.refreshToken,
      grant_type: 'refresh_token',
    });
    const res = await fetchWithTimeout(
      GOOGLE_TOKEN_URL,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      },
      GOOGLE_OAUTH_TIMEOUT_MS,
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
