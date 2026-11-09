import type { PostCallSummary } from '@signal/types';

export type PopupView = 'pre' | 'live' | 'post';

export interface StoredPopupState {
  popupView?: PopupView;
  captureActive?: boolean;
  latestSummary?: PostCallSummary | null;
}

/** Storage keys that must be cleared when the user starts over with a new call. */
export const POST_CALL_KEYS = ['latestSummary', 'popupView'] as const;

export function resolvePopupView(stored: StoredPopupState): PopupView {
  if (stored.captureActive) return 'live';
  if (stored.popupView === 'post' && stored.latestSummary) return 'post';
  return 'pre';
}

/** Popup view to persist once capture ends; a received summary wins. */
export function viewAfterCaptureEnded(stored: StoredPopupState): PopupView {
  return stored.latestSummary && stored.popupView === 'post' ? 'post' : 'pre';
}
