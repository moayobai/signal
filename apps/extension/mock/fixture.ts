import type { OverlayState, SignalFrame, TranscriptLine, PostCallSummary } from '@signal/types';

interface FixtureCallbacks {
  onOverlayState: (state: OverlayState) => void;
  onFrame: (frame: SignalFrame) => void;
  onTranscriptLine: (line: TranscriptLine) => void;
  onPostCallSummary: (summary: PostCallSummary) => void;
  onElapsed: (seconds: number) => void;
}

const TRANSCRIPT: TranscriptLine[] = [
  {
    speaker: 'prospect',
    text: 'Tell me more about the FDE model and how it compares to Mem0.',
    timestamp: 4000,
  },
  {
    speaker: 'user',
    text: 'Great question. We solve retrieval accountability, not just retrieval.',
    timestamp: 7000,
  },
  {
    speaker: 'prospect',
    text: 'What does that mean in practice for regulated industries?',
    timestamp: 12000,
  },
  {
    speaker: 'user',
    text: 'Every memory operation is auditable — read, write, delete. Mem0 has no audit trail.',
    timestamp: 18000,
  },
  { speaker: 'prospect', text: 'Interesting. What are your pricing tiers?', timestamp: 25000 },
];

const FRAMES: Array<{ t: number; frame: SignalFrame }> = [
  {
    t: 3000,
    frame: {
      prompt: {
        type: 'ASK',
        text: 'Open with their top priority — "What\'s the #1 thing you need memory to do reliably?"',
        confidence: 0.85,
        isNudge: false,
        timestamp: 3000,
      },
      bodyLang: { engagement: 'active', energy: 'rising', tone: 'curious' },
      sentiment: 55,
      dangerFlag: false,
      dangerReason: null,
    },
  },
  {
    t: 8000,
    frame: {
      prompt: {
        type: 'REFRAME',
        text: 'Lead with accountability, not accuracy. "Mem0 solves retrieval. We solve retrieval accountability — that\'s what regulated industries audit."',
        confidence: 0.92,
        isNudge: false,
        timestamp: 8000,
      },
      bodyLang: { engagement: 'strong', energy: 'high', tone: 'positive' },
      sentiment: 74,
      dangerFlag: false,
      dangerReason: null,
    },
  },
  {
    t: 15000,
    frame: {
      prompt: {
        type: 'WARN',
        text: 'Engagement dropping — shorter answers, hedging language. Re-engage with a direct question.',
        confidence: 0.88,
        isNudge: true,
        timestamp: 15000,
      },
      bodyLang: { engagement: 'moderate', energy: 'declining', tone: 'hesitant' },
      sentiment: 48,
      dangerFlag: true,
      dangerReason: 'Disengagement detected — shorter responses + hedging tone',
    },
  },
  {
    t: 22000,
    frame: {
      prompt: {
        type: 'ASK',
        text: '"What would it take for you to pilot this with one team in Q3?"',
        confidence: 0.91,
        isNudge: false,
        timestamp: 22000,
      },
      bodyLang: { engagement: 'active', energy: 'neutral', tone: 'curious' },
      sentiment: 68,
      dangerFlag: false,
      dangerReason: null,
    },
  },
  {
    t: 30000,
    frame: {
      prompt: {
        type: 'CLOSE',
        text: 'Buying signal detected. Anchor next step: "Should I send the pilot agreement to you directly?"',
        confidence: 0.94,
        isNudge: false,
        timestamp: 30000,
      },
      bodyLang: { engagement: 'strong', energy: 'high', tone: 'positive' },
      sentiment: 82,
      dangerFlag: false,
      dangerReason: null,
    },
  },
];

const POST_CALL_SUMMARY: PostCallSummary = {
  winSignals: [
    'Strong nodding at accountability framing',
    'Asked about pricing unprompted',
    'Leaned forward at pilot mention',
  ],
  objections: ['Pricing concern raised at t=25s', 'Compared to Mem0 twice'],
  decisions: ['Pilot discussion initiated', 'Q3 timeline floated', 'Direct contact confirmed'],
  followUpDraft:
    "Hi [name], great speaking today. As discussed, I'll send over the pilot agreement for a Q3 start. Looking forward to showing you the audit trail in action.",
};

export function createFixture(callbacks: FixtureCallbacks): () => void {
  const timers: ReturnType<typeof setTimeout>[] = [];
  const startTime = Date.now();

  callbacks.onOverlayState('IDLE');

  const ticker = setInterval(() => {
    callbacks.onElapsed(Math.floor((Date.now() - startTime) / 1000));
  }, 1000);

  timers.push(setTimeout(() => callbacks.onOverlayState('LIVE'), 3000));
  timers.push(setTimeout(() => callbacks.onOverlayState('DANGER'), 15000));
  timers.push(setTimeout(() => callbacks.onOverlayState('LIVE'), 22000));
  timers.push(
    setTimeout(() => {
      callbacks.onOverlayState('POSTCALL');
      callbacks.onPostCallSummary(POST_CALL_SUMMARY);
    }, 40000),
  );
  // (Previously auto-reset to IDLE at 48s — removed so the harness stays in
  // POSTCALL for previewing the summary card without a user interaction.)

  for (const line of TRANSCRIPT) {
    timers.push(setTimeout(() => callbacks.onTranscriptLine(line), line.timestamp));
  }

  for (const { t, frame } of FRAMES) {
    timers.push(setTimeout(() => callbacks.onFrame(frame), t));
  }

  return () => {
    clearInterval(ticker);
    timers.forEach(clearTimeout);
  };
}
