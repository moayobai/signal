import { describe, expect, it, vi } from 'vitest';
import { shouldReconnectAfterClose, stopMediaStreamTracks } from './captureLifecycle';

describe('capture lifecycle', () => {
  it('does not reconnect after an intentional stop', () => {
    expect(shouldReconnectAfterClose({
      intentionalStop: true,
      reconnectAttempt: 0,
      maxReconnectAttempts: 3,
    })).toBe(false);
  });

  it('reconnects transient closes until the attempt limit', () => {
    expect(shouldReconnectAfterClose({
      intentionalStop: false,
      reconnectAttempt: 2,
      maxReconnectAttempts: 3,
    })).toBe(true);
    expect(shouldReconnectAfterClose({
      intentionalStop: false,
      reconnectAttempt: 3,
      maxReconnectAttempts: 3,
    })).toBe(false);
  });

  it('stops all media tracks', () => {
    const stopA = vi.fn();
    const stopB = vi.fn();
    stopMediaStreamTracks({
      getTracks: () => [{ stop: stopA }, { stop: stopB }] as unknown as MediaStreamTrack[],
    } as MediaStream);

    expect(stopA).toHaveBeenCalledOnce();
    expect(stopB).toHaveBeenCalledOnce();
  });
});
