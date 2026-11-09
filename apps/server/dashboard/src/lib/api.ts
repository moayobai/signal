import type { CallScorecard } from '@signal/types';
export type { CallFramework, CallScorecard } from '@signal/types';

const BASE = '/api';

/** Optional columns come back from SQLite as `null` when unset. */
export interface Contact {
  id: string; name: string; email?: string | null; linkedinUrl?: string | null;
  company?: string | null; role?: string | null; notes?: string | null; octamemId?: string | null;
  createdAt: number; updatedAt: number;
}

/** Editable contact fields as held in form state (always strings). */
export type ContactForm = Partial<Record<'name' | 'email' | 'linkedinUrl' | 'company' | 'role' | 'notes', string>>;
export type ContactPayload = Partial<Record<keyof ContactForm, string>>;

/**
 * Normalises form state into a body the server's zod schema accepts.
 * Values are trimmed. `email`/`linkedinUrl` are validated as email/URL
 * server-side, so an empty string is a 400 — blank values are omitted.
 * On create every blank field is omitted; on update blank free-text fields
 * are sent as '' so the user can clear them.
 */
export function toContactPayload(form: ContactForm, mode: 'create' | 'update'): ContactPayload {
  const out: ContactPayload = {};
  for (const [k, raw] of Object.entries(form) as Array<[keyof ContactForm, string | undefined]>) {
    if (raw == null) continue;
    const v = raw.trim();
    if (v) out[k] = v;
    else if (mode === 'update' && k !== 'email' && k !== 'linkedinUrl' && k !== 'name') out[k] = '';
  }
  return out;
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
  if (status === 401) return 'Unauthorised — open the dashboard with ?token=<SIGNAL_AUTH_TOKEN>';
  if (status === 403) return 'Forbidden';
  if (status === 429) return 'Too many requests — slow down';
  if (status >= 500) return 'Server error — try again';
  return `Unexpected error (${status})`;
}
export interface CallSummaryRow {
  winSignals: string[]; objections: string[]; decisions: string[];
  followUpDraft: string; createdAt: number;
  scorecard: CallScorecard | null;
}

export interface CalendarAttendee {
  email: string;
  name?: string;
  isOrganizer?: boolean;
}
export interface UpcomingMeeting {
  id: string;
  provider: 'google' | 'outlook';
  title: string;
  startTime: number;
  endTime: number;
  attendees: CalendarAttendee[];
  meetingLink?: string | null;
  description?: string | null;
  detectedAt: number;
}

/** Pulls the first zod issue out of a 400 body, e.g. "Invalid email: Invalid email address". */
async function validationDetail(res: Response): Promise<string | null> {
  try {
    const body = await res.json() as { details?: Array<{ path?: unknown[]; message?: string }> };
    const issue = body.details?.[0];
    if (!issue?.message) return null;
    const field = issue.path?.length ? ` ${issue.path.join('.')}` : '';
    return `Invalid${field}: ${issue.message}`;
  } catch {
    return null;
  }
}

async function j<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, { credentials: 'same-origin', ...init });
  if (!res.ok) {
    const detail = res.status === 400 ? await validationDetail(res) : null;
    throw new ApiError(res.status, detail ?? friendlyMessage(res.status, path));
  }
  // 204 / empty body → null rather than a JSON parse error.
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

const enc = encodeURIComponent;
const JSON_HEADERS = { 'Content-Type': 'application/json' };

export const api = {
  contacts:        () => j<Contact[]>('/contacts'),
  contact:    (id: string) => j<Contact>(`/contacts/${enc(id)}`),
  createContact: (body: ContactPayload) =>
    j<Contact>('/contacts', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(body) }),
  updateContact: (id: string, body: ContactPayload) =>
    j<Contact>(`/contacts/${enc(id)}`, { method: 'PUT', headers: JSON_HEADERS, body: JSON.stringify(body) }),
  contactObjections: (id: string) =>
    j<Array<{ objection: string; count: number }>>(`/contacts/${enc(id)}/objections`),
  octamemQuery: (prospect: { name: string; company?: string }) =>
    j<{ context: string | null }>('/octamem/query', {
      method: 'POST', headers: JSON_HEADERS,
      body: JSON.stringify({ prospect }),
    }),
  calls:           () => j<CallSession[]>('/calls'),
  call:       (id: string) => j<CallSession>(`/calls/${enc(id)}`),
  transcript: (id: string) => j<TranscriptLine[]>(`/calls/${enc(id)}/transcript`),
  frames:     (id: string) => j<SignalFrameRow[]>(`/calls/${enc(id)}/frames`),
  summary:    (id: string) => j<CallSummaryRow>(`/calls/${enc(id)}/summary`),
  sentimentTrend: () => j<Array<{ week: string; avg: number; count: number }>>('/analytics/sentiment'),
  promptTypes:    () => j<Array<{ promptType: string; count: number }>>('/analytics/prompt-types'),
  objections:     () => j<Array<{ objection: string; count: number }>>('/analytics/objections'),
  nextMeeting:     () => j<UpcomingMeeting | null>('/calendar/next'),
  upcomingMeetings: () => j<UpcomingMeeting[]>('/calendar/upcoming'),
  searchTranscripts: (q: string, limit = 10) =>
    j<Array<{
      sessionId: string; chunkIndex: number; speaker: string; text: string;
      similarity: number; contactId: string | null; contactName: string | null;
      contactCompany?: string | null; calledAt: number | null;
    }>>(
      '/search/transcripts',
      { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ query: q, limit }) }
    ),
};

/** React Query retry policy: client errors (404, 401, 400…) won't succeed on retry. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 429) {
    return false;
  }
  return failureCount < 3;
}

export function errorMessage(error: unknown, fallback = 'Something went wrong'): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
