import { create } from 'zustand';
import type { OverlayState, SignalFrame, TranscriptLine, PostCallSummary } from '@signal/types';

interface CueHistoryEntry {
  frame: SignalFrame;
  receivedAt: number;
}

interface SignalStore {
  overlayState: OverlayState;
  frame: SignalFrame | null;
  prevSentiment: number | null;
  cueHistory: CueHistoryEntry[];
  /** Monotonically increasing; used to trigger nudge-card re-animation. */
  frameVersion: number;
  transcript: TranscriptLine[];
  elapsedSeconds: number;
  postCallSummary: PostCallSummary | null;

  setOverlayState: (state: OverlayState) => void;
  setFrame: (frame: SignalFrame) => void;
  appendTranscriptLine: (line: TranscriptLine) => void;
  setElapsedSeconds: (s: number) => void;
  setPostCallSummary: (summary: PostCallSummary) => void;
  reset: () => void;
}

const DEFAULT_FRAME: SignalFrame = {
  prompt: {
    type: 'IDLE',
    text: 'Listening...',
    confidence: 1,
    isNudge: false,
    timestamp: 0,
  },
  bodyLang: {
    engagement: 'active',
    energy: 'neutral',
    tone: 'neutral',
  },
  sentiment: 50,
  dangerFlag: false,
  dangerReason: null,
};

const MAX_CUES = 10;

export const useSignalStore = create<SignalStore>(set => ({
  overlayState: 'IDLE',
  frame: DEFAULT_FRAME,
  prevSentiment: null,
  cueHistory: [],
  frameVersion: 0,
  transcript: [],
  elapsedSeconds: 0,
  postCallSummary: null,

  setOverlayState: overlayState => set({ overlayState }),

  setFrame: frame =>
    set(s => {
      const isRealCue = frame.prompt.type !== 'IDLE';
      const next: Partial<SignalStore> = {
        frame,
        prevSentiment: s.frame?.sentiment ?? null,
        frameVersion: s.frameVersion + 1,
      };
      if (isRealCue) {
        next.cueHistory = [...s.cueHistory, { frame, receivedAt: Date.now() }].slice(-MAX_CUES);
      }
      return next;
    }),

  appendTranscriptLine: line => set(s => ({ transcript: [...s.transcript, line] })),
  setElapsedSeconds: elapsedSeconds => set({ elapsedSeconds }),
  setPostCallSummary: postCallSummary => set({ postCallSummary }),

  reset: () =>
    set({
      overlayState: 'IDLE',
      frame: DEFAULT_FRAME,
      prevSentiment: null,
      cueHistory: [],
      frameVersion: 0,
      transcript: [],
      elapsedSeconds: 0,
      postCallSummary: null,
    }),
}));
