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

export interface BodyLangRead {
  eyeContact: 'strong' | 'direct' | 'moderate' | 'avoidant';
  posture: 'forward' | 'neutral' | 'leaning back' | 'arms crossed';
  microExpressions: 'engaged' | 'nodding' | 'thinking' | 'confused' | 'sceptical';
}

export interface SignalFrame {
  prompt: SignalPrompt;
  bodyLang: BodyLangRead;
  sentiment: number; // 0–100
  dangerFlag: boolean;
  dangerReason: string | null;
}

export interface TranscriptLine {
  speaker: 'user' | 'prospect';
  text: string;
  timestamp: number;
}

export interface CallSession {
  id: string;
  platform: 'meet' | 'zoom' | 'teams';
  type: CallType;
  prospect: { name: string; company: string; role: string };
  startedAt: number;
  transcript: TranscriptLine[];
}

export interface PostCallSummary {
  winSignals: string[];
  objections: string[];
  decisions: string[];
  followUpDraft: string;
}

export type CallType = 'investor' | 'enterprise' | 'bd' | 'customer';

export type ClientMessage =
  | { type: 'start'; platform: 'meet' | 'zoom' | 'teams'; callType: CallType }
  | { type: 'stop' };

export type ServerMessage =
  | { type: 'connected'; sessionId: string }
  | { type: 'transcript'; line: TranscriptLine }
  | { type: 'frame'; frame: SignalFrame }
  | { type: 'state'; overlayState: OverlayState }
  | { type: 'error'; message: string };
