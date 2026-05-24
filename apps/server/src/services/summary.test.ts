import { describe, it, expect } from 'vitest';
import { generateSummary } from './summary.js';
import type { AICompleteOpts } from './ai.js';

const VALID_JSON = JSON.stringify({
  winSignals: ['Asked about Series A'],
  objections: ['Burn rate'],
  decisions: ['Send deck'],
  followUpDraft: 'James, great speaking today...',
});

describe('generateSummary', () => {
  it('returns null when provider returns null', async () => {
    const ai = { complete: async () => null };
    const res = await generateSummary({ ai, model: 'x', callType: 'investor', transcript: [] });
    expect(res).toBeNull();
  });
  it('parses valid JSON into PostCallSummary', async () => {
    const ai = { complete: async () => VALID_JSON };
    const res = await generateSummary({
      ai,
      model: 'claude-sonnet-4-6',
      callType: 'investor',
      transcript: [{ speaker: 'user', text: 'Hello', timestamp: 1 }],
    });
    expect(res?.winSignals).toEqual(['Asked about Series A']);
    expect(res?.followUpDraft).toContain('James');
  });
  it('passes recent sent-mail samples into the prompt for follow-up voice', async () => {
    let userPrompt = '';
    const ai = {
      complete: async (opts: AICompleteOpts) => {
        userPrompt = opts.userPrompt;
        return VALID_JSON;
      },
    };
    await generateSummary({
      ai,
      model: 'claude-sonnet-4-6',
      callType: 'investor',
      transcript: [{ speaker: 'user', text: 'Hello', timestamp: 1 }],
      voiceSamples: [{ subject: 'Next steps', body: 'Great chatting. I will send the deck.' }],
    });
    expect(userPrompt).toContain('Recent sent-email style samples');
    expect(userPrompt).toContain('Great chatting');
  });
  it('returns null on malformed JSON', async () => {
    const ai = { complete: async () => 'not json' };
    const res = await generateSummary({ ai, model: 'x', callType: 'enterprise', transcript: [] });
    expect(res).toBeNull();
  });
  it('returns null when JSON is missing fields', async () => {
    const ai = { complete: async () => '{"winSignals":["x"]}' };
    const res = await generateSummary({ ai, model: 'x', callType: 'enterprise', transcript: [] });
    expect(res).toBeNull();
  });
});
