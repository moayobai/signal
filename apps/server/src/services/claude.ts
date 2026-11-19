import type { BodyLangRead, SignalFrame } from '@signal/types';
import type { AIProvider } from './ai.js';
import { clampSentiment } from './sentiment.js';

const ENGAGEMENT = ['strong', 'active', 'moderate', 'low'] as const;
const ENERGY = ['high', 'rising', 'neutral', 'declining'] as const;
const TONE = ['positive', 'curious', 'neutral', 'hesitant', 'resistant'] as const;

/**
 * Pulls the JSON object out of a model response. Models occasionally wrap
 * output in ```json fences or add a leading sentence despite instructions;
 * dropping those frames silently delays sentiment updates by a full tick.
 */
export function extractJsonObject(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) return trimmed;
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  if (fenced && fenced[1].trim().startsWith('{')) return fenced[1].trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  return trimmed.slice(start, end + 1);
}

function toNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function pick<T extends string>(allowed: readonly T[], v: unknown, fallback: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

function normalizeBodyLang(raw: unknown): BodyLangRead {
  const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    engagement: pick(ENGAGEMENT, b.engagement, 'moderate'),
    energy: pick(ENERGY, b.energy, 'neutral'),
    tone: pick(TONE, b.tone, 'neutral'),
  };
}

export function parseSignalFrame(text: string): SignalFrame | null {
  try {
    const json = extractJsonObject(text);
    if (!json) return null;
    const obj = JSON.parse(json) as Record<string, any>;
    const sentiment = toNumber(obj.sentiment);
    if (
      !obj.prompt?.type ||
      !obj.prompt?.text ||
      sentiment === null ||
      typeof obj.dangerFlag !== 'boolean'
    ) {
      return null;
    }
    const confidence = toNumber(obj.prompt.confidence);
    return {
      ...obj,
      prompt: {
        ...obj.prompt,
        confidence: confidence === null ? 0.5 : Math.max(0, Math.min(1, confidence)),
        isNudge: obj.prompt.isNudge === true,
        timestamp: toNumber(obj.prompt.timestamp) ?? Date.now(),
      },
      bodyLang: normalizeBodyLang(obj.bodyLang),
      sentiment: Math.round(clampSentiment(sentiment)),
      dangerReason: typeof obj.dangerReason === 'string' ? obj.dangerReason : null,
    } as SignalFrame;
  } catch {
    return null;
  }
}

export interface LiveNudgeOptions {
  ai: AIProvider;
  model: string;
  systemPrompt: string;
  userPrompt: string;
}

export async function runLiveNudge(opts: LiveNudgeOptions): Promise<SignalFrame | null> {
  const text = await opts.ai.complete({
    model: opts.model,
    systemPrompt: opts.systemPrompt,
    userPrompt: opts.userPrompt,
    maxTokens: 300,
    cache: true,
  });
  if (!text) return null;
  return parseSignalFrame(text);
}
