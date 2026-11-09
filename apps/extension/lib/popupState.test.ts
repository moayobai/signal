import { describe, expect, it } from 'vitest';
import { POST_CALL_KEYS, resolvePopupView, viewAfterCaptureEnded } from './popupState';

const summary = { winSignals: [], objections: [], decisions: [], followUpDraft: '' };

describe('popup state', () => {
  it('shows the live view (with End Call) while capture is active', () => {
    expect(resolvePopupView({ captureActive: true, popupView: 'post', latestSummary: summary })).toBe('live');
  });

  it('only shows the post-call view when a summary exists', () => {
    expect(resolvePopupView({ popupView: 'post', latestSummary: summary })).toBe('post');
    expect(resolvePopupView({ popupView: 'post' })).toBe('pre');
    expect(resolvePopupView({})).toBe('pre');
  });

  it('clears both summary and view on New call so the popup does not reopen on the old summary', () => {
    expect([...POST_CALL_KEYS].sort()).toEqual(['latestSummary', 'popupView']);
  });

  it('falls back to pre-call when capture ends without a summary', () => {
    expect(viewAfterCaptureEnded({ popupView: 'live' })).toBe('pre');
    expect(viewAfterCaptureEnded({ popupView: 'post', latestSummary: summary })).toBe('post');
  });
});
