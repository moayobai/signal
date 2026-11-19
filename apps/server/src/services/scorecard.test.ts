import { describe, it, expect } from 'vitest';
import { parseScorecard, computeOverall, generateScorecard } from './scorecard.js';

const dim = (key: string, score: number) => ({ key, label: key, score, justification: 'x' });

describe('parseScorecard', () => {
  it('fills skipped dimensions with 0 in canonical order', () => {
    const r = parseScorecard(JSON.stringify({
      framework: 'BANT', dimensions: [dim('need', 8), dim('budget', 6)], nextSteps: ['a'],
    }), 'BANT');
    expect(r?.dimensions.map(d => d.key)).toEqual(['budget', 'authority', 'need', 'timeline']);
    expect(r?.dimensions.find(d => d.key === 'authority')?.score).toBe(0);
  });

  it('drops unknown and duplicate keys', () => {
    const r = parseScorecard(JSON.stringify({
      framework: 'BANT',
      dimensions: [dim('budget', 9), dim('budget', 1), dim('vibes', 10), dim('need', 5), dim('authority', 5), dim('timeline', 5)],
      nextSteps: [],
    }), 'BANT');
    expect(r?.dimensions).toHaveLength(4);
    expect(r?.dimensions[0].score).toBe(9);
  });

  it('handles fenced JSON and rejects responses with no known dimensions', () => {
    const fenced = '```json\n' + JSON.stringify({ framework: 'BANT', dimensions: [dim('need', 7)], nextSteps: [] }) + '\n```';
    expect(parseScorecard(fenced, 'BANT')).not.toBeNull();
    expect(parseScorecard(JSON.stringify({ framework: 'BANT', dimensions: [dim('vibes', 7)], nextSteps: [] }), 'BANT')).toBeNull();
  });
});

describe('computeOverall', () => {
  it('weights MEDDIC economicBuyer and champion higher', () => {
    const dims = ['metrics', 'economicBuyer', 'decisionCriteria', 'decisionProcess', 'identifyPain', 'champion']
      .map(k => ({ key: k, score: k === 'champion' || k === 'economicBuyer' ? 10 : 0 }));
    expect(computeOverall('MEDDIC', dims)).toBe(Math.round((30 / 7) * 10));
  });
});

describe('generateScorecard', () => {
  it('does not inflate the overall score when the model omits dimensions', async () => {
    const ai = { complete: async () => JSON.stringify({ framework: 'BANT', dimensions: [dim('need', 10)], nextSteps: [] }) };
    const r = await generateScorecard({ ai, model: 'm', framework: 'BANT', callType: 'enterprise', transcript: [] });
    expect(r?.overallScore).toBe(25);
  });
});
