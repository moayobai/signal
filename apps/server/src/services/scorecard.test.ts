import { describe, it, expect } from 'vitest';
import { generateScorecard } from './scorecard.js';

const SCORECARD = {
  framework: 'BANT',
  dimensions: [
    { key: 'budget', label: 'Budget', score: 8, justification: 'Budget confirmed.' },
    { key: 'authority', label: 'Authority', score: 12, justification: 'CFO on call.' },
    { key: 'need', label: 'Need', score: 6, justification: 'Clear pain.' },
    { key: 'timeline', label: 'Timeline', score: 4, justification: 'Q3 maybe.' },
  ],
  nextSteps: ['Send proposal'],
};

describe('generateScorecard', () => {
  it('parses a scorecard wrapped in a ```json fence and clamps scores (regression)', async () => {
    const ai = { complete: async () => '```json\n' + JSON.stringify(SCORECARD) + '\n```' };
    const res = await generateScorecard({ ai, model: 'x', framework: 'BANT', callType: 'enterprise', transcript: [] });
    expect(res).not.toBeNull();
    expect(res!.dimensions[1].score).toBe(10);
    // (8 + 10 + 6 + 4) / 4 = 7 → 70
    expect(res!.overallScore).toBe(70);
  });

  it('returns null for a framework mismatch', async () => {
    const ai = { complete: async () => JSON.stringify(SCORECARD) };
    const res = await generateScorecard({ ai, model: 'x', framework: 'MEDDIC', callType: 'enterprise', transcript: [] });
    expect(res).toBeNull();
  });
});
