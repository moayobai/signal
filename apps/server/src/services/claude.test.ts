import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the Anthropic SDK before importing claude.ts
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: {
        create: vi.fn(),
      },
    })),
  };
});

import Anthropic from '@anthropic-ai/sdk';
import { callClaude, parseSignalFrame } from './claude.js';

const VALID_FRAME = {
  prompt: {
    type: 'ASK',
    text: 'Ask about timeline',
    confidence: 0.85,
    isNudge: false,
    timestamp: 1234567890,
  },
  bodyLang: {
    eyeContact: 'direct',
    posture: 'neutral',
    microExpressions: 'engaged',
  },
  sentiment: 72,
  dangerFlag: false,
  dangerReason: null,
};

describe('parseSignalFrame', () => {
  it('parses valid JSON string', () => {
    const result = parseSignalFrame(JSON.stringify(VALID_FRAME));
    expect(result).not.toBeNull();
    expect(result?.prompt.type).toBe('ASK');
    expect(result?.sentiment).toBe(72);
  });

  it('returns null for invalid JSON', () => {
    expect(parseSignalFrame('not json')).toBeNull();
  });

  it('returns null for JSON missing required fields', () => {
    expect(parseSignalFrame('{"prompt": {}}')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseSignalFrame('')).toBeNull();
  });
});

describe('callClaude', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when API key is placeholder', async () => {
    const result = await callClaude({
      apiKey: 'sk-ant-your-key-here',
      systemPrompt: 'system',
      userPrompt: 'user',
    });
    expect(result).toBeNull();
  });

  it('returns null when API key is empty', async () => {
    const result = await callClaude({
      apiKey: '',
      systemPrompt: 'system',
      userPrompt: 'user',
    });
    expect(result).toBeNull();
  });

  it('calls Anthropic SDK and parses response with real-looking key', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(VALID_FRAME) }],
    });

    (Anthropic as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      messages: { create: mockCreate },
    }));

    const result = await callClaude({
      apiKey: 'sk-ant-api03-real-looking-key',
      systemPrompt: 'system',
      userPrompt: 'user',
    });

    expect(mockCreate).toHaveBeenCalledOnce();
    expect(result?.prompt.type).toBe('ASK');
  });

  it('returns null if SDK throws', async () => {
    const mockCreate = vi.fn().mockRejectedValue(new Error('API error'));

    (Anthropic as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      messages: { create: mockCreate },
    }));

    const result = await callClaude({
      apiKey: 'sk-ant-api03-real-looking-key',
      systemPrompt: 'system',
      userPrompt: 'user',
    });

    expect(result).toBeNull();
  });
});
