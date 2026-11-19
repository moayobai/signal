import { beforeEach, describe, expect, it } from 'vitest';
import type { SignalFrame } from '@signal/types';
import { useSignalStore, MAX_SENTIMENT_HISTORY } from './store';

function frame(sentiment: number, type: SignalFrame['prompt']['type'] = 'IDLE'): SignalFrame {
  return {
    prompt: { type, text: 'x', confidence: 1, isNudge: false, timestamp: 0 },
    bodyLang: { engagement: 'active', energy: 'neutral', tone: 'neutral' },
    sentiment,
    dangerFlag: false,
    dangerReason: null,
  };
}

const get = () => useSignalStore.getState();

describe('signal store sentiment', () => {
  beforeEach(() => get().reset());

  it('does not expose the placeholder sentiment before real data', () => {
    expect(get().frame?.sentiment).toBe(50);
    expect(get().sentiment).toBeNull();
    expect(get().prevSentiment).toBeNull();
    expect(get().sentimentHistory).toEqual([]);
  });

  it('uses the first real score as-is with no prior baseline', () => {
    get().setFrame(frame(80));
    expect(get().sentiment).toBe(80);
    expect(get().prevSentiment).toBeNull();
    expect(get().sentimentHistory).toEqual([80]);
  });

  it('smooths subsequent scores and tracks the previous smoothed value', () => {
    get().setFrame(frame(80));
    get().setFrame(frame(40));
    expect(get().sentiment).toBe(60);
    expect(get().prevSentiment).toBe(80);
    expect(get().sentimentHistory).toEqual([80, 60]);
  });

  it('clamps out-of-range scores', () => {
    get().setFrame(frame(140));
    expect(get().sentiment).toBe(100);
    get().reset();
    get().setFrame(frame(-20));
    expect(get().sentiment).toBe(0);
  });

  it('keeps the last known sentiment when a frame has an invalid score', () => {
    get().setFrame(frame(70));
    get().setFrame(frame(NaN));
    expect(get().sentiment).toBe(70);
    expect(get().sentimentHistory).toEqual([70]);
    expect(Number.isNaN(get().frame?.sentiment)).toBe(true);
    expect(get().frameVersion).toBe(2);
  });

  it('caps sentiment history during rapid updates', () => {
    for (let i = 0; i < MAX_SENTIMENT_HISTORY + 25; i++) {
      get().setFrame(frame(i % 2 === 0 ? 0 : 100));
    }
    const h = get().sentimentHistory;
    expect(h).toHaveLength(MAX_SENTIMENT_HISTORY);
    // Alternating 0/100 is damped to stay well inside the extremes.
    for (const v of h.slice(5)) {
      expect(v).toBeGreaterThan(20);
      expect(v).toBeLessThan(80);
    }
  });

  it('records only non-IDLE frames as cues', () => {
    get().setFrame(frame(50));
    get().setFrame(frame(50, 'ASK'));
    expect(get().cueHistory).toHaveLength(1);
  });

  it('reset clears sentiment state', () => {
    get().setFrame(frame(90));
    get().reset();
    expect(get().sentiment).toBeNull();
    expect(get().sentimentHistory).toEqual([]);
  });
});
