import { describe, it, expect } from 'vitest';
import { extractFaceSignals, FaceEmotionSmoother, createHumeClient, type HumeStreamResponse } from './hume.js';

const payload = (emotions: Array<{ name: string; score: number }>, prob = 0.95): HumeStreamResponse => ({
  face: { predictions: [{ bbox: { x: 0, y: 0, w: 1, h: 1, prob }, emotions }] },
});

describe('extractFaceSignals', () => {
  it('returns top-3 emotions from the most confident face', () => {
    const res = extractFaceSignals({
      face: {
        predictions: [
          { bbox: { x: 0, y: 0, w: 1, h: 1, prob: 0.85 }, emotions: [{ name: 'Anger', score: 0.9 }] },
          { bbox: { x: 0, y: 0, w: 1, h: 1, prob: 0.97 }, emotions: [
            { name: 'Joy', score: 0.6 }, { name: 'Interest', score: 0.7 },
            { name: 'Calmness', score: 0.2 }, { name: 'Boredom', score: 0.1 },
          ] },
        ],
      },
    });
    expect(res?.dominantEmotion).toBe('Interest');
    expect(res?.topEmotions.map(e => e.name)).toEqual(['Interest', 'Joy', 'Calmness']);
    expect(res?.attention).toBe(0.97);
  });

  it('rejects faces below the detection threshold', () => {
    expect(extractFaceSignals(payload([{ name: 'Joy', score: 0.9 }], 0.5))).toBeNull();
  });

  it('returns null with no predictions', () => {
    expect(extractFaceSignals({ face: { predictions: [] } })).toBeNull();
    expect(extractFaceSignals({})).toBeNull();
  });

  it('smooths a single-frame flip of the dominant emotion', () => {
    const smoother = new FaceEmotionSmoother(0.4);
    const calm = [{ name: 'Joy', score: 0.8 }, { name: 'Anger', score: 0.1 }];
    extractFaceSignals(payload(calm), smoother);
    extractFaceSignals(payload(calm), smoother);
    const flipped = extractFaceSignals(payload([{ name: 'Joy', score: 0.1 }, { name: 'Anger', score: 0.8 }]), smoother);
    expect(flipped?.dominantEmotion).toBe('Joy');
  });
});

describe('FaceEmotionSmoother', () => {
  it('decays emotions absent from the latest frame', () => {
    const s = new FaceEmotionSmoother(0.5);
    s.update([{ name: 'Joy', score: 0.8 }]);
    const out = s.update([{ name: 'Interest', score: 0.4 }]);
    expect(out.find(e => e.name === 'Joy')?.score).toBeCloseTo(0.4, 5);
    expect(out.find(e => e.name === 'Interest')?.score).toBeCloseTo(0.2, 5);
  });
});

describe('createHumeClient', () => {
  it('no-ops on placeholder key', () => {
    const h = createHumeClient({ apiKey: 'your-hume-key', onFaceSignals: () => {} });
    expect(() => { h.sendFrame('abc'); h.close(); }).not.toThrow();
  });
});
