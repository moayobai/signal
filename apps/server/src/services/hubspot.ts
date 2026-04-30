import type { PostCallSummary } from '@signal/types';

const BASE_URL = 'https://api.hubapi.com';
const PLACEHOLDER_PREFIXES = ['your-hubspot', 'your-'];
const TIMEOUT_MS = 10_000;

// HubSpot CRM association type IDs — contact ↔ call is 194 (call → contact).
// See https://developers.hubspot.com/docs/api/crm/associations
const ASSOC_CALL_TO_CONTACT = 194;

function isPlaceholder(key: string): boolean {
  if (!key) return true;
  return PLACEHOLDER_PREFIXES.some(p => key.startsWith(p));
}

async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ac.signal });
  } finally {
    clearTimeout(timer);
  }
}

function splitName(full: string): { firstname: string; lastname: string } {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return { firstname: parts[0] ?? '', lastname: '' };
  return { firstname: parts[0] ?? '', lastname: parts.slice(1).join(' ') };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function htmlList(items: string[]): string {
  if (!items.length) return '<p><em>none</em></p>';
  return '<ul>' + items.map(i => `<li>${escapeHtml(i)}</li>`).join('') + '</ul>';
}

function buildBodyHtml(summary: PostCallSummary): string {
  return [
    '<h3>Win signals</h3>',
    htmlList(summary.winSignals),
    '<h3>Objections</h3>',
    htmlList(summary.objections),
    '<h3>Decisions</h3>',
    htmlList(summary.decisions),
    '<h3>Follow-up draft</h3>',
    `<pre>${escapeHtml(summary.followUpDraft)}</pre>`,
  ].join('');
}

export interface FindOrCreateContactOpts {
  apiKey: string;
  prospect: { name: string; email?: string; company?: string };
}

export async function findOrCreateContact(
  opts: FindOrCreateContactOpts,
): Promise<{ hubspotId: string } | null> {
  if (isPlaceholder(opts.apiKey)) return null;
  const { apiKey, prospect } = opts;
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };

  try {
    // Search by email first when available.
    if (prospect.email) {
      const res = await fetchWithTimeout(
        `${BASE_URL}/crm/v3/objects/contacts/search`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            filterGroups: [
              {
                filters: [{ propertyName: 'email', operator: 'EQ', value: prospect.email }],
              },
            ],
            limit: 1,
          }),
        },
        TIMEOUT_MS,
      );
      if (res.ok) {
        const data = (await res.json()) as { results?: Array<{ id: string }> };
        if (data.results && data.results.length > 0 && data.results[0]?.id) {
          return { hubspotId: data.results[0].id };
        }
      } else {
        console.error('[SIGNAL] HubSpot contact search failed:', res.status);
      }
    }

    const { firstname, lastname } = splitName(prospect.name);
    const properties: Record<string, string> = { firstname, lastname };
    if (prospect.email) properties.email = prospect.email;
    if (prospect.company) properties.company = prospect.company;

    const createRes = await fetchWithTimeout(
      `${BASE_URL}/crm/v3/objects/contacts`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ properties }),
      },
      TIMEOUT_MS,
    );
    if (!createRes.ok) {
      const body = await createRes.text().catch(() => '');
      console.error('[SIGNAL] HubSpot contact create failed:', createRes.status, body);
      return null;
    }
    const created = (await createRes.json()) as { id?: string };
    return created.id ? { hubspotId: created.id } : null;
  } catch (err) {
    console.error('[SIGNAL] HubSpot findOrCreateContact failed:', err);
    return null;
  }
}

export interface WriteCallEngagementOpts {
  apiKey: string;
  hubspotContactId: string;
  summary: PostCallSummary;
  durationMs: number;
  sentimentAvg: number | null;
  startedAt: number;
}

export async function writeCallEngagement(
  opts: WriteCallEngagementOpts,
): Promise<{ engagementId: string } | null> {
  if (isPlaceholder(opts.apiKey)) return null;
  const headers = {
    Authorization: `Bearer ${opts.apiKey}`,
    'Content-Type': 'application/json',
  };

  const date = new Date(opts.startedAt).toISOString().slice(0, 10);
  const properties: Record<string, string | number> = {
    hs_call_title: `Signal call — ${date}`,
    hs_call_body: buildBodyHtml(opts.summary),
    hs_call_duration: opts.durationMs,
    hs_timestamp: opts.startedAt,
  };

  try {
    const res = await fetchWithTimeout(
      `${BASE_URL}/crm/v3/objects/calls`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          properties,
          associations: [
            {
              to: { id: opts.hubspotContactId },
              types: [
                {
                  associationCategory: 'HUBSPOT_DEFINED',
                  associationTypeId: ASSOC_CALL_TO_CONTACT,
                },
              ],
            },
          ],
        }),
      },
      TIMEOUT_MS,
    );
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('[SIGNAL] HubSpot call engagement create failed:', res.status, body);
      return null;
    }
    const data = (await res.json()) as { id?: string };
    return data.id ? { engagementId: data.id } : null;
  } catch (err) {
    console.error('[SIGNAL] HubSpot writeCallEngagement failed:', err);
    return null;
  }
}
