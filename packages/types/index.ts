export type PromptType =
  | 'ASK'
  | 'CLOSE'
  | 'WARN'
  | 'REFRAME'
  | 'BODY'
  | 'SILENCE'
  | 'IDLE';

export type OverlayState = 'IDLE' | 'LIVE' | 'DANGER' | 'POSTCALL';

export interface SignalPrompt {
  type: PromptType;
  text: string;
  confidence: number; // 0–1
  isNudge: boolean;
  timestamp: number;
}

/**
 * Speech signals inferred from transcript patterns by Claude.
 * These are conversation/language-based — not video body language.
 *
 * engagement: how actively the prospect is participating (response length, question count)
 * energy:     enthusiasm inferred from word choice, punctuation, response cadence
 * tone:       emotional register inferred from phrasing, hedging, and sentiment markers
 */
export interface BodyLangRead {
  engagement: 'strong' | 'active' | 'moderate' | 'low';
  energy: 'high' | 'rising' | 'neutral' | 'declining';
  tone: 'positive' | 'curious' | 'neutral' | 'hesitant' | 'resistant';
}

/**
 * Real-time facial emotion data from Hume AI.
 * Only present when HUME_API_KEY is configured and video capture is active.
 */
export interface FaceSignals {
  /** Top 3 emotions by score */
  topEmotions: Array<{ name: string; score: number }>;
  /** Single highest-scoring emotion name */
  dominantEmotion: string;
  /** Face presence/visibility score (0–1). Low = face not clearly detected. */
  attention: number;
}

export interface SignalFrame {
  prompt: SignalPrompt;
  bodyLang: BodyLangRead;
  /** Hume AI face emotion data — undefined when video is not available */
  faceSignals?: FaceSignals;
  sentiment: number; // 0–100
  dangerFlag: boolean;
  dangerReason: string | null;
}

export interface TranscriptLine {
  speaker: 'user' | 'prospect';
  text: string;
  timestamp: number;
}

export interface PostCallSummary {
  winSignals: string[];
  objections: string[];
  decisions: string[];
  followUpDraft: string;
}

export type CallType = 'investor' | 'enterprise' | 'bd' | 'customer';

export interface Prospect {
  name: string;
  company?: string;
  email?: string;
  linkedinUrl?: string;
}

export type ClientMessage =
  | {
      type: 'start';
      platform: 'meet' | 'zoom' | 'teams';
      callType: CallType;
      prospect: Prospect;
    }
  | { type: 'stop' }
  | {
      /** Base64-encoded JPEG frame from tab video capture, sent every ~4s */
      type: 'video_frame';
      data: string;
    };

export type ServerMessage =
  | { type: 'connected'; sessionId: string }
  | { type: 'transcript'; line: TranscriptLine }
  | { type: 'frame'; frame: SignalFrame }
  | { type: 'state'; overlayState: OverlayState }
  | { type: 'summary'; summary: PostCallSummary }
  | { type: 'error'; message: string };
