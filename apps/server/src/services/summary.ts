import type { CallType, PostCallSummary, TranscriptLine } from '@signal/types';
import type { AIProvider } from './ai.js';

export interface GenerateSummaryOpts {
  ai: AIProvider;
  model: string;
  callType: CallType;
  transcript: TranscriptLine[];
}

const SYSTEM_PROMPT = `You are SIGNAL's post-call analyst. Given a full call transcript, produce a crisp JSON summary.

Return ONLY valid JSON matching this exact shape — no markdown, no prose:
{
  "winSignals":     string[],   // concrete buyer-intent moments
  "objections":     string[],   // explicit concerns raised
  "decisions":      string[],   // next steps either side committed to
  "followUpDraft":  string      // 2-4 sentence follow-up email draft, first-person
}

Rules:
- Each array item is a short phrase (≤ 100 chars).
- followUpDraft is ready to send as-is.
- Return empty arrays if the category is genuinely absent (do NOT invent).`;

function buildUserPrompt(callType: CallType, transcript: TranscriptLine[]): string {
  const lines = transcript.map(l => `[${l.speaker.toUpperCase()}] ${l.text}`).join('\n');
  return `Call type: ${callType}\n\nTranscript:\n${lines}\n\nReturn the PostCallSummary JSON now.`;
}

function parseSummary(text: string): PostCallSummary | null {
  try {
    const obj = JSON.parse(text) as Partial<PostCallSummary>;
    if (
      !Array.isArray(obj.winSignals) ||
      !Array.isArray(obj.objections) ||
      !Array.isArray(obj.decisions) ||
      typeof obj.followUpDraft !== 'string'
    )
      return null;
    return obj as PostCallSummary;
  } catch {
    return null;
  }
}

export async function generateSummary(opts: GenerateSummaryOpts): Promise<PostCallSummary | null> {
  const text = await opts.ai.complete({
    model: opts.model,
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: buildUserPrompt(opts.callType, opts.transcript),
    maxTokens: 600,
    cache: false,
  });
  if (!text) return null;
  return parseSummary(text);
}
