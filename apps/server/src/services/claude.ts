import Anthropic from '@anthropic-ai/sdk';
import type { SignalFrame } from '@signal/types';

const PLACEHOLDER_PREFIXES = ['sk-ant-your-key', 'your-'];

function isPlaceholderKey(key: string): boolean {
  if (!key) return true;
  return PLACEHOLDER_PREFIXES.some(p => key.startsWith(p));
}

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

interface ClaudeCallOptions {
  apiKey: string;
  systemPrompt: string;
  userPrompt: string;
}

export async function callClaude(options: ClaudeCallOptions): Promise<SignalFrame | null> {
  const { apiKey, systemPrompt, userPrompt } = options;

  if (isPlaceholderKey(apiKey)) {
    return null;
  }

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: [
        {
          type: 'text',
          text: systemPrompt,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: userPrompt }],
    });

    const content = response.content[0];
    if (content.type !== 'text') return null;

    return parseSignalFrame(content.text);
  } catch (err) {
    console.error('[SIGNAL] Claude call failed:', err);
    return null;
  }
}
