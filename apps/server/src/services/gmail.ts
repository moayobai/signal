/**
 * Gmail connector — reads recent sent mail so follow-up drafts can learn the
 * user's writing voice. Auth uses an OAuth refresh token obtained via the
 * one-off `scripts/google-oauth.mjs` flow.
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';
const TIMEOUT_MS = 10_000;

async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ac.signal });
  } finally {
    clearTimeout(timer);
  }
}

function isBlank(v: string | undefined): boolean {
  return !v || v.trim() === '' || v.startsWith('your-');
}

export interface RefreshTokenOpts {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export async function refreshAccessToken(opts: RefreshTokenOpts): Promise<string | null> {
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
      TOKEN_URL,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      },
      TIMEOUT_MS,
    );
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      console.error('[SIGNAL] Gmail token refresh failed:', res.status, txt);
      return null;
    }
    const data = (await res.json()) as { access_token?: string };
    return data.access_token ?? null;
  } catch (err) {
    console.error('[SIGNAL] Gmail token refresh failed:', err);
    return null;
  }
}

export interface FetchRecentSentEmailsOpts {
  accessToken: string;
  limit?: number;
}

export interface SentEmail {
  subject: string;
  body: string;
  sentAt: number;
}

interface GmailMessagePart {
  mimeType?: string;
  body?: { data?: string; size?: number };
  parts?: GmailMessagePart[];
  headers?: Array<{ name: string; value: string }>;
}

interface GmailMessage {
  id: string;
  internalDate?: string;
  payload?: GmailMessagePart;
}

function base64UrlDecode(s: string): string {
  const normalised = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = normalised.length % 4 === 0 ? '' : '='.repeat(4 - (normalised.length % 4));
  try {
    return Buffer.from(normalised + pad, 'base64').toString('utf8');
  } catch {
    return '';
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function findPart(part: GmailMessagePart | undefined, mime: string): GmailMessagePart | null {
  if (!part) return null;
  if (part.mimeType === mime && part.body?.data) return part;
  if (part.parts) {
    for (const child of part.parts) {
      const found = findPart(child, mime);
      if (found) return found;
    }
  }
  return null;
}

function extractBody(payload: GmailMessagePart | undefined): string {
  const plain = findPart(payload, 'text/plain');
  if (plain?.body?.data) return base64UrlDecode(plain.body.data);
  const html = findPart(payload, 'text/html');
  if (html?.body?.data) return stripHtml(base64UrlDecode(html.body.data));
  if (payload?.body?.data) return base64UrlDecode(payload.body.data);
  return '';
}

function extractHeader(payload: GmailMessagePart | undefined, name: string): string {
  if (!payload?.headers) return '';
  const lower = name.toLowerCase();
  const h = payload.headers.find(x => x.name.toLowerCase() === lower);
  return h?.value ?? '';
}

export async function fetchRecentSentEmails(
  opts: FetchRecentSentEmailsOpts,
): Promise<SentEmail[] | null> {
  if (isBlank(opts.accessToken)) return null;
  const limit = opts.limit ?? 20;
  const headers = { Authorization: `Bearer ${opts.accessToken}` };

  try {
    const listRes = await fetchWithTimeout(
      `${GMAIL_BASE}/messages?q=${encodeURIComponent('in:sent')}&maxResults=${limit}`,
      { headers },
      TIMEOUT_MS,
    );
    if (!listRes.ok) {
      console.error('[SIGNAL] Gmail list failed:', listRes.status);
      return null;
    }
    const list = (await listRes.json()) as { messages?: Array<{ id: string }> };
    if (!list.messages) return [];

    const results: SentEmail[] = [];
    for (const { id } of list.messages) {
      const msgRes = await fetchWithTimeout(
        `${GMAIL_BASE}/messages/${id}?format=full`,
        { headers },
        TIMEOUT_MS,
      );
      if (!msgRes.ok) continue;
      const msg = (await msgRes.json()) as GmailMessage;
      const subject = extractHeader(msg.payload, 'Subject');
      const body = extractBody(msg.payload);
      const sentAt = msg.internalDate ? Number(msg.internalDate) : 0;
      results.push({ subject, body, sentAt });
    }
    return results;
  } catch (err) {
    console.error('[SIGNAL] Gmail fetchRecentSentEmails failed:', err);
    return null;
  }
}
