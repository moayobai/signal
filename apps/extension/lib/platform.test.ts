import { describe, expect, it } from 'vitest';
import { platformFromHostname, platformFromUrl } from './platform';

describe('platform detection', () => {
  it('maps meeting hosts to platforms', () => {
    expect(platformFromHostname('meet.google.com')).toBe('meet');
    expect(platformFromHostname('app.zoom.us')).toBe('zoom');
    expect(platformFromHostname('teams.microsoft.com')).toBe('teams');
  });

  it('does not match lookalike hosts', () => {
    expect(platformFromHostname('notzoom.us')).toBeNull();
    expect(platformFromHostname('meet.google.com.evil.example')).toBeNull();
  });

  it('derives the platform from the captured tab URL, not a stale detection', () => {
    expect(platformFromUrl('https://app.zoom.us/wc/123/join')).toBe('zoom');
    expect(platformFromUrl(undefined)).toBeNull();
    expect(platformFromUrl('not a url')).toBeNull();
  });
});
