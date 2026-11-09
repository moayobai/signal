import type { ServerMessage } from '@signal/types';
import { useSignalStore } from './store';

type Store = ReturnType<typeof useSignalStore.getState>;

interface HandlerDeps {
  getStore?: () => Store;
  now?: () => number;
}

export interface OverlayMessageHandler {
  handle(msg: ServerMessage): void;
  dispose(): void;
}

/**
 * Applies server messages to the HUD store and drives the call timer
 * (the real call has no fixture to tick `elapsedSeconds`).
 */
export function createOverlayMessageHandler({
  getStore = () => useSignalStore.getState(),
  now = Date.now,
}: HandlerDeps = {}): OverlayMessageHandler {
  let ticker: ReturnType<typeof setInterval> | null = null;
  let callStartedAt = 0;

  function startTimer(): void {
    if (ticker !== null) return; // reconnects keep the original call clock
    callStartedAt = now();
    getStore().setElapsedSeconds(0);
    ticker = setInterval(() => {
      getStore().setElapsedSeconds(Math.floor((now() - callStartedAt) / 1000));
    }, 1000);
  }

  function stopTimer(): void {
    if (ticker !== null) { clearInterval(ticker); ticker = null; }
  }

  return {
    handle(msg) {
      const store = getStore();
      switch (msg.type) {
        case 'frame':      store.setFrame(msg.frame); break;
        case 'transcript': store.appendTranscriptLine(msg.line); break;
        case 'state':
          store.setOverlayState(msg.overlayState);
          if (msg.overlayState === 'IDLE' || msg.overlayState === 'POSTCALL') stopTimer();
          break;
        case 'connected':
          // A fresh call (not a mid-call reconnect) starts from a clean HUD.
          if (ticker === null) store.reset();
          getStore().setOverlayState('LIVE');
          startTimer();
          break;
        case 'summary':
          store.setPostCallSummary(msg.summary);
          store.setOverlayState('POSTCALL');
          stopTimer();
          break;
        case 'error':
          console.error('[SIGNAL] Server error:', msg.message);
          break;
      }
    },
    dispose: stopTimer,
  };
}
