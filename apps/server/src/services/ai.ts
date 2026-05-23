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

const PLACEHOLDER_PREFIXES = [
  'placeholder',
  'sk-ant-placeholder',
  'sk-ant-your-key',
  'sk-or-placeholder',
  'sk-or-your-key',
  'together-placeholder',
  'together-your-key',
  'your-',
];
function isPlaceholder(key: string): boolean {
  if (!key) return true;
  return PLACEHOLDER_PREFIXES.some(p => key.startsWith(p));
}

/**
 * Error message surfaced when the AI provider is disabled (placeholder
 * or missing API keys). Retained export so callers/tests can reference it.
 */
export const AI_DISABLED =
  '[SIGNAL] AI_PROVIDER disabled — no nudges will fire. Set ANTHROPIC_API_KEY, OPENROUTER_API_KEY, or TOGETHER_API_KEY.';

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
  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }
  async complete(opts: AICompleteOpts): Promise<string | null> {
    try {
      const res = await this.client.messages.create({
        model: opts.model,
        max_tokens: opts.maxTokens,
        system: opts.cache
          ? [
              {
                type: 'text' as const,
                text: opts.systemPrompt,
                cache_control: { type: 'ephemeral' as const },
              },
            ]
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

class OpenAICompatibleProvider implements AIProvider {
  constructor(
    private readonly opts: {
      apiKey: string;
      baseUrl: string;
      label: string;
    },
  ) {}

  async complete(opts: AICompleteOpts): Promise<string | null> {
    try {
      const baseUrl = this.opts.baseUrl.replace(/\/$/, '');
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.opts.apiKey}`,
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
      const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      return data.choices?.[0]?.message?.content ?? null;
    } catch (err) {
      console.error(`[SIGNAL] ${this.opts.label} call failed:`, err);
      return null;
    }
  }
}

export class OpenRouterProvider extends OpenAICompatibleProvider {
  constructor(apiKey: string) {
    super({
      apiKey,
      baseUrl: 'https://openrouter.ai/api/v1',
      label: 'OpenRouter',
    });
  }
}

export class TogetherProvider extends OpenAICompatibleProvider {
  constructor(apiKey: string, baseUrl = 'https://api.together.ai/v1') {
    super({
      apiKey,
      baseUrl,
      label: 'Together AI',
    });
  }
}

export type AIProviderName = 'claude' | 'openrouter' | 'together';

export interface AIConfig {
  provider: AIProviderName;
  anthropicApiKey: string;
  openrouterApiKey: string;
  togetherApiKey: string;
  togetherBaseUrl?: string;
}

export function createAIProvider(config: AIConfig): AIProvider {
  if (config.provider === 'openrouter') {
    if (isPlaceholder(config.openrouterApiKey)) {
      console.warn(AI_DISABLED);
      return new NoOpProvider();
    }
    return new OpenRouterProvider(config.openrouterApiKey);
  }
  if (config.provider === 'together') {
    if (isPlaceholder(config.togetherApiKey)) {
      console.warn(AI_DISABLED);
      return new NoOpProvider();
    }
    return new TogetherProvider(config.togetherApiKey, config.togetherBaseUrl);
  }
  if (isPlaceholder(config.anthropicApiKey)) {
    console.warn(AI_DISABLED);
    return new NoOpProvider();
  }
  return new ClaudeProvider(config.anthropicApiKey);
}
