import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createOverlayMessageHandler } from './serverMessages';
import { useSignalStore } from './store';

const summary = { winSignals: ['a'], objections: [], decisions: [], followUpDraft: 'x' };

describe('createOverlayMessageHandler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useSignalStore.getState().reset();
  });
  afterEach(() => vi.useRealTimers());

  it('stores the summary so the POSTCALL card actually renders', () => {
    const h = createOverlayMessageHandler();
    h.handle({ type: 'summary', summary });
    const s = useSignalStore.getState();
    expect(s.overlayState).toBe('POSTCALL');
    expect(s.postCallSummary).toEqual(summary);
    h.dispose();
  });

  it('ticks the call timer from connect until the call ends', () => {
    const h = createOverlayMessageHandler();
    h.handle({ type: 'connected', sessionId: 's1' });
    expect(useSignalStore.getState().overlayState).toBe('LIVE');
    vi.advanceTimersByTime(3000);
    expect(useSignalStore.getState().elapsedSeconds).toBe(3);
    h.handle({ type: 'summary', summary });
    vi.advanceTimersByTime(5000);
    expect(useSignalStore.getState().elapsedSeconds).toBe(3);
    h.dispose();
  });

  it('resets leftover HUD state for a new call but not on a mid-call reconnect', () => {
    const h = createOverlayMessageHandler();
    useSignalStore.getState().appendTranscriptLine({ speaker: 'user', text: 'old call', timestamp: 1 });
    useSignalStore.getState().setPostCallSummary(summary);
    h.handle({ type: 'connected', sessionId: 's1' });
    expect(useSignalStore.getState().transcript).toEqual([]);
    expect(useSignalStore.getState().postCallSummary).toBeNull();

    h.handle({ type: 'transcript', line: { speaker: 'prospect', text: 'hi', timestamp: 2 } });
    vi.advanceTimersByTime(2000);
    h.handle({ type: 'connected', sessionId: 's2' });
    expect(useSignalStore.getState().transcript).toHaveLength(1);
    vi.advanceTimersByTime(1000);
    expect(useSignalStore.getState().elapsedSeconds).toBe(3);
    h.dispose();
  });

  it('stops the timer when the background reports the call went idle', () => {
    const h = createOverlayMessageHandler();
    h.handle({ type: 'connected', sessionId: 's1' });
    vi.advanceTimersByTime(1000);
    h.handle({ type: 'state', overlayState: 'IDLE' });
    vi.advanceTimersByTime(5000);
    expect(useSignalStore.getState().elapsedSeconds).toBe(1);
    expect(useSignalStore.getState().overlayState).toBe('IDLE');
  });
});
