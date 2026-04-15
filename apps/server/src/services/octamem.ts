import type { CallType, PostCallSummary } from '@signal/types';

const DEFAULT_BASE = 'https://api.octamem.com';
const PLACEHOLDER_PREFIXES = ['your-octamem', 'your-'];
function isPlaceholder(key: string): boolean {
  if (!key) return true;
  return PLACEHOLDER_PREFIXES.some(p => key.startsWith(p));
}

function baseUrl(): string { return process.env.OCTAMEM_BASE_URL ?? DEFAULT_BASE; }

export interface QueryOpts {
  apiKey: string;
  prospect: { name: string; company?: string };
  previousOctamemId?: string;
}

export async function queryProspectContext(opts: QueryOpts): Promise<string | null> {
  if (isPlaceholder(opts.apiKey)) return null;
  const query = `${opts.prospect.name}${opts.prospect.company ? ' at ' + opts.prospect.company : ''} — what do we know?`;
  try {
    const res = await fetch(`${baseUrl()}/v1/query`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${opts.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, previousContext: opts.previousOctamemId }),
    });
    if (!res.ok) return null;
    const data = await res.json() as { result?: string };
    return data.result ?? null;
  } catch (err) {
    console.error('[SIGNAL] OctaMem query failed:', err);
    return null;
  }
}

export interface StoreOpts {
  apiKey: string;
  contact: { name: string; company?: string; role?: string };
  callType: CallType;
  durationMs: number;
  sentimentAvg: number;
  summary: PostCallSummary;
  dangerMoments: Array<{ reason: string; timestamp: number }>;
  previousOctamemId?: string;
}

function formatMemory(o: StoreOpts): string {
  const { contact, callType, durationMs, sentimentAvg, summary, dangerMoments } = o;
  const date = new Date().toISOString().slice(0, 10);
  const mins = Math.round(durationMs / 60000);
  const header = `Call: ${contact.name}${contact.role ? ` (${contact.role}` : ''}${contact.company ? `, ${contact.company}` : ''}${contact.role ? ')' : ''} — ${date}, ${mins} min, ${callType}`;
  const lines = [
    header,
    `Sentiment: ${Math.round(sentimentAvg)}/100`,
    '',
    `Win signals: ${summary.winSignals.join('; ') || '(none)'}`,
    `Objections: ${summary.objections.join('; ') || '(none)'}`,
    `Decisions: ${summary.decisions.join('; ') || '(none)'}`,
    `Follow-up: "${summary.followUpDraft}"`,
  ];
  if (dangerMoments.length > 0) {
    lines.push('', `Danger moments: ${dangerMoments.map(d => `${d.reason}@${d.timestamp}`).join('; ')}`);
  }
  return lines.join('\n');
}

export async function storeCallMemory(opts: StoreOpts): Promise<string | null> {
  if (isPlaceholder(opts.apiKey)) return null;
  try {
    const res = await fetch(`${baseUrl()}/v1/add`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${opts.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: formatMemory(opts), previousContext: opts.previousOctamemId }),
    });
    if (!res.ok) return null;
    const data = await res.json() as { id?: string };
    return data.id ?? null;
  } catch (err) {
    console.error('[SIGNAL] OctaMem store failed:', err);
    return null;
  }
}
