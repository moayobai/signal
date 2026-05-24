import { describe, it, expect } from 'vitest';
import { parseSignalFrame, runLiveNudge } from './claude.js';
import { NoOpProvider } from './ai.js';

const VALID_FRAME = {
  prompt: {
    type: 'ASK',
    text: 'Ask about timeline',
    confidence: 0.85,
    isNudge: false,
    timestamp: 1234567890,
  },
  bodyLang: { eyeContact: 'direct', posture: 'neutral', microExpressions: 'engaged' },
  sentiment: 72,
  dangerFlag: false,
  dangerReason: null,
};

describe('parseSignalFrame', () => {
  it('parses valid JSON string', () => {
    const result = parseSignalFrame(JSON.stringify(VALID_FRAME));
    expect(result?.prompt.type).toBe('ASK');
    expect(result?.sentiment).toBe(72);
  });
  it('returns null for invalid JSON', () => {
    expect(parseSignalFrame('not json')).toBeNull();
  });
  it('returns null for JSON missing required fields', () => {
    expect(parseSignalFrame('{"prompt": {}}')).toBeNull();
  });
});

describe('runLiveNudge', () => {
  it('returns null when provider returns null', async () => {
    const result = await runLiveNudge({
      ai: new NoOpProvider(),
      model: 'claude-haiku-4-5-20251001',
      systemPrompt: 's',
      userPrompt: 'u',
    });
    expect(result).toBeNull();
  });
  it('returns parsed frame when provider returns JSON', async () => {
    const ai = { complete: async () => JSON.stringify(VALID_FRAME) };
    const result = await runLiveNudge({ ai, model: 'x', systemPrompt: 's', userPrompt: 'u' });
    expect(result?.prompt.type).toBe('ASK');
  });
});
