const BASE = '/api';

export interface Contact {
  id: string; name: string; email?: string; linkedinUrl?: string;
  company?: string; role?: string; notes?: string; octamemId?: string;
  createdAt: number; updatedAt: number;
}
export interface CallSession {
  id: string; contactId: string | null; platform: string; callType: string;
  startedAt: number; endedAt: number | null; durationMs: number | null;
  sentimentAvg: number | null;
  userWords?: number;
  prospectWords?: number;
  talkRatio?: number | null;
  longestMonologueMs?: number | null;
}
export interface TranscriptLine { id: number; speaker: string; text: string; timestamp: number; }
export interface SignalFrameRow {
  id: number;
  /** Alias of `createdAt` — kept for backwards compat with existing components. */
  timestamp: number;
  /** Milliseconds from call start — use to render MM:SS timestamp in UI */
  offsetMs: number;
  promptType: string; promptText: string;
  confidence: number; sentiment: number; dangerFlag: number; createdAt: number;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

function friendlyMessage(status: number, path: string): string {
  if (status === 404) {
    if (path.includes('/contacts/')) return 'Contact not found';
    if (path.includes('/calls/')) return 'Call not found';
    return 'Not found';
  }
  if (status === 400) return 'Invalid request';
  if (status === 401) return 'Unauthorised';
  if (status === 403) return 'Forbidden';
  if (status === 429) return 'Too many requests — slow down';
  if (status >= 500) return 'Server error — try again';
  return `Unexpected error (${status})`;
}
export interface CallSummaryRow {
  winSignals: string[]; objections: string[]; decisions: string[];
  followUpDraft: string; createdAt: number;
}

async function j<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, init);
  if (!res.ok) throw new ApiError(res.status, friendlyMessage(res.status, path));
  return res.json();
}

export const api = {
  contacts:        () => j<Contact[]>('/contacts'),
  contact:    (id: string) => j<Contact>(`/contacts/${id}`),
  createContact: (body: Partial<Contact>) =>
    j<Contact>('/contacts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  updateContact: (id: string, body: Partial<Contact>) =>
    j<Contact>(`/contacts/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  contactObjections: (id: string) =>
    j<Array<{ objection: string; count: number }>>(`/contacts/${id}/objections`),
  octamemQuery: (prospect: { name: string; company?: string }) =>
    j<{ context: string | null }>('/octamem/query', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prospect }),
    }),
  calls:           () => j<CallSession[]>('/calls'),
  call:       (id: string) => j<CallSession>(`/calls/${id}`),
  transcript: (id: string) => j<TranscriptLine[]>(`/calls/${id}/transcript`),
  frames:     (id: string) => j<SignalFrameRow[]>(`/calls/${id}/frames`),
  summary:    (id: string) => j<CallSummaryRow>(`/calls/${id}/summary`),
  sentimentTrend: () => j<Array<{ week: string; avg: number; count: number }>>('/analytics/sentiment'),
  promptTypes:    () => j<Array<{ promptType: string; count: number }>>('/analytics/prompt-types'),
  objections:     () => j<Array<{ objection: string; count: number }>>('/analytics/objections'),
};
