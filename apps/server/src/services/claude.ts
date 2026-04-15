import type { SignalFrame } from '@signal/types';
import type { AIProvider } from './ai.js';

export function parseSignalFrame(text: string): SignalFrame | null {
  try {
    const obj = JSON.parse(text) as Partial<SignalFrame>;
    if (
      !obj.prompt?.type ||
      !obj.prompt?.text ||
      typeof obj.sentiment !== 'number' ||
      typeof obj.dangerFlag !== 'boolean'
    ) {
      return null;
    }
    return obj as SignalFrame;
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
