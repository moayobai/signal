import { afterEach, describe, expect, it, vi } from 'vitest';
import { playNudgeTone } from './sound';

describe('playNudgeTone', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('no-ops when AudioContext is unavailable', () => {
    expect(() => playNudgeTone()).not.toThrow();
  });

  it('does not throw when the AudioContext cannot be created', () => {
    vi.stubGlobal('AudioContext', class { constructor() { throw new Error('too many contexts'); } });
    expect(() => playNudgeTone()).not.toThrow();
  });

  it('closes the context if scheduling the tone fails', () => {
    const close = vi.fn(() => Promise.resolve());
    vi.stubGlobal('AudioContext', class {
      close = close;
      createOscillator() { throw new Error('boom'); }
    });
    expect(() => playNudgeTone()).not.toThrow();
    expect(close).toHaveBeenCalledOnce();
  });
});
