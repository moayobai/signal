import Anthropic from '@anthropic-ai/sdk';

export interface AICompleteOpts {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens: number;
  cache?: boolean;
}

export interface AIProvider {
  complete(opts: AICompleteOpts): Promise<string | null>;
}

const PLACEHOLDER_PREFIXES = ['sk-ant-your-key', 'sk-or-your-key', 'your-'];
function isPlaceholder(key: string): boolean {
  if (!key) return true;
  return PLACEHOLDER_PREFIXES.some(p => key.startsWith(p));
}

/**
 * Error message surfaced when the AI provider is disabled (placeholder
 * or missing API keys). Retained export so callers/tests can reference it.
 */
export const AI_DISABLED =
  '[SIGNAL] AI_PROVIDER disabled — no nudges will fire. Set ANTHROPIC_API_KEY or OPENROUTER_API_KEY.';

export class NoOpProvider implements AIProvider {
  private warned = false;
  async complete(_opts: AICompleteOpts): Promise<string | null> {
    if (!this.warned) {
      console.warn(AI_DISABLED);
      this.warned = true;
    }
    return null;
  }
}

export class ClaudeProvider implements AIProvider {
  private client: Anthropic;
  constructor(apiKey: string) { this.client = new Anthropic({ apiKey }); }
  async complete(opts: AICompleteOpts): Promise<string | null> {
    try {
      const res = await this.client.messages.create({
        model: opts.model,
        max_tokens: opts.maxTokens,
        system: opts.cache
          ? [{ type: 'text' as const, text: opts.systemPrompt, cache_control: { type: 'ephemeral' as const } }]
          : opts.systemPrompt,
        messages: [{ role: 'user' as const, content: opts.userPrompt }],
      });
      const content = res.content[0];
      return content?.type === 'text' ? content.text : null;
    } catch (err) {
      console.error('[SIGNAL] Claude call failed:', err);
      return null;
    }
  }
}

export class OpenRouterProvider implements AIProvider {
  constructor(private apiKey: string) {}
  async complete(opts: AICompleteOpts): Promise<string | null> {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: opts.model,
          max_tokens: opts.maxTokens,
          messages: [
            { role: 'system', content: opts.systemPrompt },
            { role: 'user', content: opts.userPrompt },
          ],
        }),
      });
      if (!res.ok) return null;
      const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
      return data.choices?.[0]?.message?.content ?? null;
    } catch (err) {
      console.error('[SIGNAL] OpenRouter call failed:', err);
      return null;
    }
  }
}

export interface AIConfig {
  provider: 'claude' | 'openrouter';
  anthropicApiKey: string;
  openrouterApiKey: string;
}

export function createAIProvider(config: AIConfig): AIProvider {
  if (config.provider === 'openrouter') {
    if (isPlaceholder(config.openrouterApiKey)) {
      console.warn(AI_DISABLED);
      return new NoOpProvider();
    }
    return new OpenRouterProvider(config.openrouterApiKey);
  }
  if (isPlaceholder(config.anthropicApiKey)) {
    console.warn(AI_DISABLED);
    return new NoOpProvider();
  }
  return new ClaudeProvider(config.anthropicApiKey);
}
