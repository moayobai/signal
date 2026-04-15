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
}
export interface TranscriptLine { id: number; speaker: string; text: string; timestamp: number; }
export interface SignalFrameRow {
  id: number; promptType: string; promptText: string;
  confidence: number; sentiment: number; dangerFlag: number; createdAt: number;
}
export interface CallSummaryRow {
  winSignals: string[]; objections: string[]; decisions: string[];
  followUpDraft: string; createdAt: number;
}

async function j<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, init);
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

export const api = {
  contacts:        () => j<Contact[]>('/contacts'),
  contact:    (id: string) => j<Contact>(`/contacts/${id}`),
  updateContact: (id: string, body: Partial<Contact>) =>
    j<Contact>(`/contacts/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  calls:           () => j<CallSession[]>('/calls'),
  call:       (id: string) => j<CallSession>(`/calls/${id}`),
  transcript: (id: string) => j<TranscriptLine[]>(`/calls/${id}/transcript`),
  frames:     (id: string) => j<SignalFrameRow[]>(`/calls/${id}/frames`),
  summary:    (id: string) => j<CallSummaryRow>(`/calls/${id}/summary`),
  sentimentTrend: () => j<Array<{ week: string; avg: number; count: number }>>('/analytics/sentiment'),
  promptTypes:    () => j<Array<{ promptType: string; count: number }>>('/analytics/prompt-types'),
  objections:     () => j<Array<{ objection: string; count: number }>>('/analytics/objections'),
};
