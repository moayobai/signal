import { describe, it, expect } from 'vitest';
import { parseSignalFrame, runLiveNudge } from './claude.js';
import { NoOpProvider } from './ai.js';

const VALID_FRAME = {
  prompt: { type: 'ASK', text: 'Ask about timeline', confidence: 0.85, isNudge: false, timestamp: 1234567890 },
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

describe('parseSignalFrame robustness', () => {
  it('extracts JSON wrapped in markdown fences', () => {
    const text = '```json\n' + JSON.stringify(VALID_FRAME) + '\n```';
    expect(parseSignalFrame(text)?.sentiment).toBe(72);
  });
  it('extracts JSON preceded by prose', () => {
    const text = 'Here is the frame:\n' + JSON.stringify(VALID_FRAME);
    expect(parseSignalFrame(text)?.prompt.type).toBe('ASK');
  });
  it('clamps out-of-range sentiment and confidence', () => {
    const r = parseSignalFrame(JSON.stringify({
      ...VALID_FRAME, sentiment: 140, prompt: { ...VALID_FRAME.prompt, confidence: 3 },
    }));
    expect(r?.sentiment).toBe(100);
    expect(r?.prompt.confidence).toBe(1);
  });
  it('accepts numeric-string sentiment', () => {
    expect(parseSignalFrame(JSON.stringify({ ...VALID_FRAME, sentiment: '64.4' }))?.sentiment).toBe(64);
  });
  it('rejects non-numeric sentiment', () => {
    expect(parseSignalFrame(JSON.stringify({ ...VALID_FRAME, sentiment: 'high' }))).toBeNull();
  });
  it('normalizes invalid bodyLang values to neutral defaults', () => {
    const r = parseSignalFrame(JSON.stringify({ ...VALID_FRAME, bodyLang: { engagement: 'strong', tone: 'angry' } }));
    expect(r?.bodyLang).toEqual({ engagement: 'strong', energy: 'neutral', tone: 'neutral' });
  });
});
