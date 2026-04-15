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
    "eyeContact": "strong" | "direct" | "moderate" | "avoidant",
    "posture": "forward" | "neutral" | "leaning back" | "arms crossed",
    "microExpressions": "engaged" | "nodding" | "thinking" | "confused" | "sceptical"
  },
  "sentiment": 0–100,
  "dangerFlag": true | false,
  "dangerReason": "string" | null
}

## Rules
- bodyLang: Phase 2 has no video — always return { eyeContact: "direct", posture: "neutral", microExpressions: "engaged" }
- If no action needed: type = "IDLE", isNudge = false, confidence = 0.1
- dangerFlag: true only for pricing objection, competitor mention, or >30s silence
- timestamp: current unix milliseconds`;
}

export function buildUserPrompt(transcript: Array<{ speaker: string; text: string; timestamp: number }>): string {
  const lines = transcript
    .map(l => `[${l.speaker.toUpperCase()}] ${l.text}`)
    .join('\n');
  return `Transcript (last 90s):\n${lines}\n\nReturn the SignalFrame JSON now.`;
}
