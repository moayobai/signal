import { create } from 'zustand';
import type {
  OverlayState,
  SignalFrame,
  TranscriptLine,
  PostCallSummary,
} from '@signal/types';
import { sanitizeSentiment } from '../lib/sentiment';

interface CueHistoryEntry {
  frame: SignalFrame;
  receivedAt: number;
}

interface SignalStore {
  overlayState: OverlayState;
  frame: SignalFrame | null;
  /**
   * Sentiment shown in the UI (already smoothed server-side). Null until the server has sent
   * a usable score — the placeholder frame's value is never displayed.
   */
  sentiment: number | null;
  /** Previous sentiment; null until two real samples have arrived. */
  prevSentiment: number | null;
  /** Recent sentiment samples, oldest first. */
  sentimentHistory: number[];
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
export const MAX_SENTIMENT_HISTORY = 60;

export const useSignalStore = create<SignalStore>((set) => ({
  overlayState: 'IDLE',
  frame: DEFAULT_FRAME,
  sentiment: null,
  prevSentiment: null,
  sentimentHistory: [],
  cueHistory: [],
  frameVersion: 0,
  transcript: [],
  elapsedSeconds: 0,
  postCallSummary: null,

  setOverlayState: (overlayState) => set({ overlayState }),

  setFrame: (frame) => set((s) => {
    const isRealCue = frame.prompt.type !== 'IDLE';
    const next: Partial<SignalStore> = {
      frame,
      frameVersion: s.frameVersion + 1,
    };
    // The server already smooths sentiment (confidence-weighted EMA in
    // services/sentiment.ts), so use it as-is — smoothing again here would
    // compound lag. Frames with a missing/invalid score keep the last known
    // sentiment rather than snapping the ring to 0.
    const value = sanitizeSentiment(frame.sentiment);
    if (value != null) {
      next.sentiment = value;
      next.prevSentiment = s.sentiment;
      next.sentimentHistory = [...s.sentimentHistory, value].slice(-MAX_SENTIMENT_HISTORY);
    }
    if (isRealCue) {
      next.cueHistory = [
        ...s.cueHistory,
        { frame, receivedAt: Date.now() },
      ].slice(-MAX_CUES);
    }
    return next;
  }),

  appendTranscriptLine: (line) =>
    set((s) => ({ transcript: [...s.transcript, line] })),
  setElapsedSeconds: (elapsedSeconds) => set({ elapsedSeconds }),
  setPostCallSummary: (postCallSummary) => set({ postCallSummary }),

  reset: () =>
    set({
      overlayState: 'IDLE',
      frame: DEFAULT_FRAME,
      sentiment: null,
      prevSentiment: null,
      sentimentHistory: [],
      cueHistory: [],
      frameVersion: 0,
      transcript: [],
      elapsedSeconds: 0,
      postCallSummary: null,
    }),
}));
