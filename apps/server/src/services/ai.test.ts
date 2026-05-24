import { describe, it, expect, vi } from 'vitest';

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'hello' }] }),
    },
  })),
}));

import {
  createAIProvider,
  ClaudeProvider,
  OpenRouterProvider,
  TogetherProvider,
  NoOpProvider,
} from './ai.js';

describe('createAIProvider', () => {
  it('returns NoOpProvider when ANTHROPIC_API_KEY is placeholder', () => {
    const p = createAIProvider({
      provider: 'claude',
      anthropicApiKey: 'sk-ant-your-key-here',
      openrouterApiKey: '',
      togetherApiKey: '',
    });
    expect(p).toBeInstanceOf(NoOpProvider);
  });
  it('returns NoOpProvider for e2e placeholder keys', () => {
    const claude = createAIProvider({
      provider: 'claude',
      anthropicApiKey: 'sk-ant-placeholder',
      openrouterApiKey: '',
      togetherApiKey: '',
    });
    const openrouter = createAIProvider({
      provider: 'openrouter',
      anthropicApiKey: '',
      openrouterApiKey: 'sk-or-placeholder',
      togetherApiKey: '',
    });
    const together = createAIProvider({
      provider: 'together',
      anthropicApiKey: '',
      openrouterApiKey: '',
      togetherApiKey: 'together-placeholder',
    });
    expect(claude).toBeInstanceOf(NoOpProvider);
    expect(openrouter).toBeInstanceOf(NoOpProvider);
    expect(together).toBeInstanceOf(NoOpProvider);
  });
  it('returns ClaudeProvider for real claude key', () => {
    const p = createAIProvider({
      provider: 'claude',
      anthropicApiKey: 'sk-ant-api03-real',
      openrouterApiKey: '',
      togetherApiKey: '',
    });
    expect(p).toBeInstanceOf(ClaudeProvider);
  });
  it('returns OpenRouterProvider when provider=openrouter with real key', () => {
    const p = createAIProvider({
      provider: 'openrouter',
      anthropicApiKey: '',
      openrouterApiKey: 'sk-or-real',
      togetherApiKey: '',
    });
    expect(p).toBeInstanceOf(OpenRouterProvider);
  });
  it('returns TogetherProvider when provider=together with real key', () => {
    const p = createAIProvider({
      provider: 'together',
      anthropicApiKey: '',
      openrouterApiKey: '',
      togetherApiKey: 'real-together-key',
    });
    expect(p).toBeInstanceOf(TogetherProvider);
  });
  it('returns NoOpProvider when openrouter key is placeholder', () => {
    const p = createAIProvider({
      provider: 'openrouter',
      anthropicApiKey: '',
      openrouterApiKey: 'sk-or-your-key-here',
      togetherApiKey: '',
    });
    expect(p).toBeInstanceOf(NoOpProvider);
  });
  it('returns NoOpProvider when together key is placeholder', () => {
    const p = createAIProvider({
      provider: 'together',
      anthropicApiKey: '',
      openrouterApiKey: '',
      togetherApiKey: 'together-your-key-here',
    });
    expect(p).toBeInstanceOf(NoOpProvider);
  });
});

describe('NoOpProvider', () => {
  it('returns null from complete()', async () => {
    const p = new NoOpProvider();
    const result = await p.complete({
      model: 'x',
      systemPrompt: 's',
      userPrompt: 'u',
      maxTokens: 100,
    });
    expect(result).toBeNull();
  });
});

describe('ClaudeProvider.complete', () => {
  it('calls Anthropic SDK and returns text', async () => {
    const p = new ClaudeProvider('sk-ant-api03-real');
    const result = await p.complete({
      model: 'claude-haiku-4-5-20251001',
      systemPrompt: 's',
      userPrompt: 'u',
      maxTokens: 100,
      cache: true,
    });
    expect(result).toBe('hello');
  });
});

describe('OpenRouterProvider.complete', () => {
  it('POSTs to openrouter and returns content', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'howdy' } }] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const p = new OpenRouterProvider('sk-or-real');
    const result = await p.complete({
      model: 'anthropic/claude-haiku',
      systemPrompt: 's',
      userPrompt: 'u',
      maxTokens: 100,
    });
    expect(result).toBe('howdy');
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toContain('openrouter.ai');
    expect(JSON.parse(opts.body as string).model).toBe('anthropic/claude-haiku');
    vi.unstubAllGlobals();
  });
  it('returns null on non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const p = new OpenRouterProvider('sk-or-real');
    const result = await p.complete({
      model: 'x',
      systemPrompt: 's',
      userPrompt: 'u',
      maxTokens: 100,
    });
    expect(result).toBeNull();
    vi.unstubAllGlobals();
  });
});

describe('TogetherProvider.complete', () => {
  it('POSTs to Together AI and returns content', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'together response' } }] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const p = new TogetherProvider('real-together-key');
    const result = await p.complete({
      model: 'openai/gpt-oss-20b',
      systemPrompt: 's',
      userPrompt: 'u',
      maxTokens: 100,
    });
    expect(result).toBe('together response');
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.together.ai/v1/chat/completions');
    expect(opts.headers.Authorization).toBe('Bearer real-together-key');
    expect(JSON.parse(opts.body as string).model).toBe('openai/gpt-oss-20b');
    vi.unstubAllGlobals();
  });
});
