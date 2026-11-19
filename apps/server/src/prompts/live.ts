import { readFileSync } from 'fs';
import { join } from 'path';
import type { CallType } from '@signal/types';

function loadCompanyContext(): string {
  try {
    const p = join(process.cwd(), 'knowledge', 'company.md');
    return readFileSync(p, 'utf-8');
  } catch {
    return '(no company context loaded)';
  }
}

const COMPANY_CONTEXT = loadCompanyContext();

export function buildSystemPrompt(callType: CallType, octaMemContext?: string | null): string {
  const priorContext = octaMemContext
    ? `\n## Prior Context on This Prospect\n${octaMemContext}\n`
    : '';
  return `You are SIGNAL, a real-time AI co-pilot for ${callType} calls. You receive a rolling transcript and return structured coaching JSON.

## Company Context
${COMPANY_CONTEXT}
${priorContext}
## Your Role
Analyse the last 90 seconds of transcript and return a single JSON object. Keep prompts under 160 characters. Be direct. Prioritise the highest-value action right now.

## Call Type
${callType}

## Output Schema
Return ONLY valid JSON matching this exact shape — no markdown, no explanation:
{
  "prompt": {
    "type": "ASK" | "CLOSE" | "WARN" | "REFRAME" | "BODY" | "SILENCE" | "IDLE",
    "text": "string (≤160 chars)",
    "confidence": 0.0–1.0,
    "isNudge": true | false,
    "timestamp": <unix ms>
  },
  "bodyLang": {
    "engagement": "strong" | "active" | "moderate" | "low",
    "energy": "high" | "rising" | "neutral" | "declining",
    "tone": "positive" | "curious" | "neutral" | "hesitant" | "resistant"
  },
  "sentiment": 0–100,
  "dangerFlag": true | false,
  "dangerReason": "string" | null
}

## Rules
- bodyLang: infer from SPEECH patterns only (no video). Use these signals:
  - engagement → "strong" if long, specific answers + follow-up questions; "low" if short/deflective responses
  - energy → "high" if enthusiastic word choice, exclamations, fast back-and-forth; "declining" if response length shortens over time
  - tone → "positive" if affirming language; "resistant" if objection phrases ("but", "however", "not sure"); "hesitant" if hedging ("maybe", "we'll see", "I'd have to check")
- sentiment: the PROSPECT's current disposition toward the deal (ignore the rep's own enthusiasm). Weight the most recent prospect lines most heavily — the score should reflect how they feel now, not the window average. Anchors:
  - 0–20  = hostile / disengaging ("this isn't a fit", "we're going with someone else")
  - 21–40 = resistant / skeptical (objections, pushback, "too expensive", "not convinced")
  - 41–59 = neutral / guarded (factual answers, no commitment either way, hedging)
  - 60–79 = interested / receptive (asks questions, shares pain, agrees with points)
  - 80–100 = enthusiastic / buying (commits to next steps, talks timelines or rollout)
  - Sarcasm or polite deflection ("sounds great, send me something") is NOT positive. A raised objection followed by acceptance is positive.
  - If the prospect has said little or nothing, return 50.
- prompt.confidence reflects how much transcript evidence supports your read, including the sentiment score (sparse or ambiguous window → ≤ 0.4).
- If no action needed: type = "IDLE", isNudge = false (confidence still reflects the evidence for your sentiment read)
- dangerFlag: true only for pricing objection, competitor mention, or >30s silence
- timestamp: current unix milliseconds`;
}

export function buildUserPrompt(transcript: Array<{ speaker: string; text: string; timestamp: number }>): string {
  const now = transcript.length ? transcript[transcript.length - 1].timestamp : 0;
  const lines = transcript
    .map(l => `[-${Math.max(0, Math.round((now - l.timestamp) / 1000))}s] [${l.speaker.toUpperCase()}] ${l.text}`)
    .join('\n');
  return `Transcript (last 90s, oldest first; [-Ns] = seconds before the latest line):\n${lines}\n\nReturn the SignalFrame JSON now.`;
}
