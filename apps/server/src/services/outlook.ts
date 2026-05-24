import { fetchWithTimeout, isBlank } from './google-auth.js';
import { refreshMicrosoftAccessToken } from './microsoft-auth.js';
import type { SentEmail } from './gmail.js';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const TIMEOUT_MS = 10_000;
const OUTLOOK_MAIL_SCOPE = 'https://graph.microsoft.com/Mail.Read offline_access';

export interface OutlookRefreshTokenOpts {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  tenantId?: string;
}

export async function refreshOutlookAccessToken(
  opts: OutlookRefreshTokenOpts,
): Promise<string | null> {
  return refreshMicrosoftAccessToken(
    {
      ...opts,
      scope: OUTLOOK_MAIL_SCOPE,
    },
    'Outlook Mail',
  );
}

export interface FetchRecentOutlookSentEmailsOpts {
  accessToken: string;
  limit?: number;
}

interface OutlookMessage {
  id?: string;
  subject?: string | null;
  sentDateTime?: string | null;
  bodyPreview?: string | null;
  body?: {
    contentType?: 'text' | 'html';
    content?: string | null;
  } | null;
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

function bodyText(message: OutlookMessage): string {
  const body = message.body?.content?.trim() ?? '';
  if (body) return message.body?.contentType === 'html' ? stripHtml(body) : body;
  return message.bodyPreview?.trim() ?? '';
}

export async function fetchRecentOutlookSentEmails(
  opts: FetchRecentOutlookSentEmailsOpts,
): Promise<SentEmail[] | null> {
  if (isBlank(opts.accessToken)) return null;
  const limit = Math.max(1, Math.min(opts.limit ?? 20, 50));
  const params = new URLSearchParams({
    $top: String(limit),
    $select: 'subject,bodyPreview,body,sentDateTime',
    $orderby: 'sentDateTime desc',
  });
  const url = `${GRAPH_BASE}/me/mailFolders('SentItems')/messages?${params.toString()}`;

  try {
    const res = await fetchWithTimeout(
      url,
      {
        headers: {
          Authorization: `Bearer ${opts.accessToken}`,
          Prefer: 'outlook.body-content-type="text"',
        },
      },
      TIMEOUT_MS,
    );
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      console.error('[SIGNAL] Outlook sent mail list failed:', res.status, txt);
      return null;
    }
    const data = (await res.json()) as { value?: OutlookMessage[] };
    return (data.value ?? []).map(message => ({
      subject: message.subject ?? '',
      body: bodyText(message),
      sentAt: message.sentDateTime ? Date.parse(message.sentDateTime) || 0 : 0,
    }));
  } catch (err) {
    console.error('[SIGNAL] Outlook fetchRecentSentEmails failed:', err);
    return null;
  }
}
