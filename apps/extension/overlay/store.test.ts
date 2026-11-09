import { beforeEach, describe, expect, it } from 'vitest';
import type { SignalFrame } from '@signal/types';
import { MAX_TRANSCRIPT_LINES, useSignalStore } from './store';

function frame(sentiment: number, type: SignalFrame['prompt']['type'] = 'ASK'): SignalFrame {
  return {
    prompt: { type, text: 't', confidence: 1, isNudge: false, timestamp: sentiment },
    bodyLang: { engagement: 'active', energy: 'neutral', tone: 'neutral' },
    sentiment,
    dangerFlag: false,
    dangerReason: null,
  };
}

describe('signal store', () => {
  beforeEach(() => useSignalStore.getState().reset());

  it('has no sentiment baseline until a second real frame arrives', () => {
    useSignalStore.getState().setFrame(frame(80));
    expect(useSignalStore.getState().prevSentiment).toBeNull();
    useSignalStore.getState().setFrame(frame(60));
    expect(useSignalStore.getState().prevSentiment).toBe(80);
  });

  it('caps the transcript on long calls', () => {
    const { appendTranscriptLine } = useSignalStore.getState();
    for (let i = 0; i < MAX_TRANSCRIPT_LINES + 25; i++) {
      appendTranscriptLine({ speaker: 'user', text: String(i), timestamp: i });
    }
    const t = useSignalStore.getState().transcript;
    expect(t).toHaveLength(MAX_TRANSCRIPT_LINES);
    expect(t[t.length - 1].text).toBe(String(MAX_TRANSCRIPT_LINES + 24));
  });

  it('keeps IDLE frames out of the cue history', () => {
    useSignalStore.getState().setFrame(frame(50, 'IDLE'));
    expect(useSignalStore.getState().cueHistory).toEqual([]);
  });
});
