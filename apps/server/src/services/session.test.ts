import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CallSession } from './session.js';

describe('CallSession — rolling window', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('keeps lines within 90s window', () => {
    const session = new CallSession('meet', 'enterprise');
    const now = Date.now();

    session.addLine({ speaker: 'user', text: 'hello', timestamp: now - 95_000 });
    session.addLine({ speaker: 'prospect', text: 'world', timestamp: now });

    expect(session.getWindow()).toHaveLength(1);
    expect(session.getWindow()[0].text).toBe('world');
  });

  it('newLinesSinceLastCall increments and resets', () => {
    const session = new CallSession('meet', 'enterprise');
    expect(session.newLinesSinceLastCall).toBe(0);

    session.addLine({ speaker: 'user', text: 'line 1', timestamp: Date.now() });
    session.addLine({ speaker: 'user', text: 'line 2', timestamp: Date.now() });
    expect(session.newLinesSinceLastCall).toBe(2);

    session.resetNewLines();
    expect(session.newLinesSinceLastCall).toBe(0);
  });
});

describe('CallSession — danger detection', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('detects silence after 30s', () => {
    const session = new CallSession('meet', 'enterprise');
    session.addLine({ speaker: 'user', text: 'hi', timestamp: Date.now() });

    vi.advanceTimersByTime(31_000);
    expect(session.isSilent()).toBe(true);
  });

  it('not silent immediately after a line', () => {
    const session = new CallSession('meet', 'enterprise');
    session.addLine({ speaker: 'user', text: 'hi', timestamp: Date.now() });
    vi.advanceTimersByTime(5_000);
    expect(session.isSilent()).toBe(false);
  });

  it('detects pricing keyword', () => {
    const session = new CallSession('meet', 'enterprise');
    expect(session.detectKeyword('what is the price for this?')).toBe('pricing');
  });

  it('detects competitor name', () => {
    const session = new CallSession('meet', 'enterprise');
    session.setCompetitors(['Acme Corp', 'Rival Inc']);
    expect(session.detectKeyword('we already use Acme Corp')).toBe('competitor');
  });

  it('returns null for benign transcript', () => {
    const session = new CallSession('meet', 'enterprise');
    expect(session.detectKeyword('tell me more about your platform')).toBeNull();
  });
});

describe('CallSession — keyword false positives (regression)', () => {
  it('does not flag substrings of unrelated words as pricing', () => {
    const session = new CallSession('meet', 'enterprise');
    expect(session.detectKeyword('that was a heroic effort')).toBeNull();
    expect(session.detectKeyword('we ship an android app')).toBeNull();
    expect(session.detectKeyword('nice costume')).toBeNull();
  });

  it('still flags whole-word and plural pricing keywords', () => {
    const session = new CallSession('meet', 'enterprise');
    expect(session.detectKeyword('What is the ROI?')).toBe('pricing');
    expect(session.detectKeyword('our costs are high')).toBe('pricing');
    expect(session.detectKeyword('is it affordable')).toBe('pricing');
  });

  it('ignores blank competitor names instead of matching every line', () => {
    const session = new CallSession('meet', 'enterprise');
    session.setCompetitors(['', '  ', 'Rival']);
    expect(session.detectKeyword('tell me about your platform')).toBeNull();
    expect(session.detectKeyword('we use rival today')).toBe('competitor');
  });
});
