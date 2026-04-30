export type PromptType = 'ASK' | 'CLOSE' | 'WARN' | 'REFRAME' | 'BODY' | 'SILENCE' | 'IDLE';

/**
 * Collapses the 7 internal PromptType values into 2 user-facing categories
 * (plus Idle). Internal types remain untouched for analytics/coloring —
 * this only affects what users see in the UI.
 *
 *   Say this → ASK, CLOSE, REFRAME   (actionable prompts)
 *   Careful  → WARN, BODY, SILENCE   (warnings / caution)
 *   Idle     → IDLE
 */
export function userFacingLabel(type: string): 'Say this' | 'Careful' | 'Idle' {
  if (type === 'IDLE') return 'Idle';
  if (type === 'WARN' || type === 'BODY' || type === 'SILENCE') return 'Careful';
  return 'Say this';
}

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

export type CallFramework = 'MEDDIC' | 'SPICED' | 'BANT';

/**
 * Per-framework-dimension score (0–10) with Claude's justification.
 * Keys differ by framework:
 *  - MEDDIC: metrics, economicBuyer, decisionCriteria, decisionProcess, identifyPain, champion
 *  - SPICED: situation, pain, impact, criticalEvent, decision
 *  - BANT:   budget, authority, need, timeline
 */
export interface CallScorecard {
  framework: CallFramework;
  overallScore: number; // 0–100, weighted average of dimensions
  dimensions: Array<{
    key: string;
    label: string;
    score: number; // 0–10
    justification: string; // 1–2 sentences
  }>;
  nextSteps: string[]; // 2–4 concrete next actions
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
  | { type: 'scorecard'; scorecard: CallScorecard }
  | { type: 'error'; message: string };
