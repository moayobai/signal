import type { PostCallSummary } from '@signal/types';

const PLACEHOLDER_PREFIXES = ['your-slack', 'your-'];
const POST_TIMEOUT_MS = 10_000;

function isPlaceholder(url: string): boolean {
  if (!url) return true;
  return PLACEHOLDER_PREFIXES.some(p => url.startsWith(p));
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

function formatDuration(ms: number): string {
  const mins = Math.round(ms / 60000);
  if (mins < 1) return '<1 min';
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}

function bullets(items: string[]): string {
  if (!items.length) return '_(none)_';
  return items.map(i => `• ${i}`).join('\n');
}

export interface SlackPostOpts {
  webhookUrl: string;
  contact: { name: string; company?: string };
  summary: PostCallSummary;
  callUrl?: string;
  durationMs: number;
  sentimentAvg: number | null;
}

export async function postCallSummaryToSlack(opts: SlackPostOpts): Promise<void> {
  if (isPlaceholder(opts.webhookUrl)) return;

  const { contact, summary, durationMs, sentimentAvg, callUrl } = opts;
  const who = contact.company ? `${contact.name} (${contact.company})` : contact.name;
  const headerText = `📞 Call with ${who} — ${formatDuration(durationMs)}`;
  const sentimentText =
    sentimentAvg === null ? 'Sentiment: _n/a_' : `Sentiment: *${Math.round(sentimentAvg)}/100*`;

  const blocks: unknown[] = [
    { type: 'header', text: { type: 'plain_text', text: headerText, emoji: true } },
    { type: 'section', text: { type: 'mrkdwn', text: sentimentText } },
    { type: 'divider' },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*Win signals*\n${bullets(summary.winSignals)}` },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*Objections*\n${bullets(summary.objections)}` },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*Decisions*\n${bullets(summary.decisions)}` },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*Follow-up draft*\n\`\`\`${summary.followUpDraft}\`\`\`` },
    },
  ];

  if (callUrl) {
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `<${callUrl}|Open call in SIGNAL dashboard>` }],
    });
  }

  const payload = { text: headerText, blocks };

  try {
    const res = await fetchWithTimeout(
      opts.webhookUrl,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
      POST_TIMEOUT_MS,
    );
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('[SIGNAL] Slack post failed:', res.status, body);
    }
  } catch (err) {
    console.error('[SIGNAL] Slack post failed:', err);
  }
}
