import { create } from 'zustand';
import type {
  OverlayState,
  SignalFrame,
  TranscriptLine,
  PostCallSummary,
} from '@signal/types';

interface SignalStore {
  overlayState: OverlayState;
  frame: SignalFrame | null;
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
    eyeContact: 'direct',
    posture: 'neutral',
    microExpressions: 'engaged',
  },
  sentiment: 50,
  dangerFlag: false,
  dangerReason: null,
};

export const useSignalStore = create<SignalStore>((set) => ({
  overlayState: 'IDLE',
  frame: DEFAULT_FRAME,
  transcript: [],
  elapsedSeconds: 0,
  postCallSummary: null,

  setOverlayState: (overlayState) => set({ overlayState }),
  setFrame: (frame) => set({ frame }),
  appendTranscriptLine: (line) =>
    set((s) => ({ transcript: [...s.transcript, line] })),
  setElapsedSeconds: (elapsedSeconds) => set({ elapsedSeconds }),
  setPostCallSummary: (postCallSummary) => set({ postCallSummary }),
  reset: () =>
    set({
      overlayState: 'IDLE',
      frame: DEFAULT_FRAME,
      transcript: [],
      elapsedSeconds: 0,
      postCallSummary: null,
    }),
}));
