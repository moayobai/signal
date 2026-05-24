import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createFixture } from './fixture';

describe('createFixture', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('starts in IDLE state', () => {
    const events: string[] = [];
    const stop = createFixture({
      onOverlayState: s => events.push(s),
      onFrame: () => {},
      onTranscriptLine: () => {},
      onPostCallSummary: () => {},
      onElapsed: () => {},
    });
    expect(events[0]).toBe('IDLE');
    stop();
  });

  it('transitions to LIVE after 3s', () => {
    const events: string[] = [];
    const stop = createFixture({
      onOverlayState: s => events.push(s),
      onFrame: () => {},
      onTranscriptLine: () => {},
      onPostCallSummary: () => {},
      onElapsed: () => {},
    });
    vi.advanceTimersByTime(3100);
    expect(events).toContain('LIVE');
    stop();
  });

  it('transitions to DANGER after 15s', () => {
    const events: string[] = [];
    const stop = createFixture({
      onOverlayState: s => events.push(s),
      onFrame: () => {},
      onTranscriptLine: () => {},
      onPostCallSummary: () => {},
      onElapsed: () => {},
    });
    vi.advanceTimersByTime(15100);
    expect(events).toContain('DANGER');
    stop();
  });

  it('transitions to POSTCALL after 40s', () => {
    const events: string[] = [];
    const stop = createFixture({
      onOverlayState: s => events.push(s),
      onFrame: () => {},
      onTranscriptLine: () => {},
      onPostCallSummary: () => {},
      onElapsed: () => {},
    });
    vi.advanceTimersByTime(40100);
    expect(events).toContain('POSTCALL');
    stop();
  });
});
