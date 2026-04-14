import type { TranscriptLine, CallType } from '@signal/types';

const PRICING_KEYWORDS = ['price', 'cost', 'expensive', 'budget', 'afford', 'pricing', 'roi', 'investment'];
const SILENCE_THRESHOLD_MS = 30_000;
const WINDOW_DURATION_MS = 90_000;

export class CallSession {
  readonly id: string;
  readonly platform: 'meet' | 'zoom' | 'teams';
  readonly callType: CallType;

  private window: TranscriptLine[] = [];
  private _newLinesSinceLastCall = 0;
  private lastTranscriptAt: number | null = null;
  private competitors: string[] = [];

  constructor(platform: 'meet' | 'zoom' | 'teams', callType: CallType) {
    this.id = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.platform = platform;
    this.callType = callType;
  }

  addLine(line: TranscriptLine): void {
    this.window.push(line);
    this._newLinesSinceLastCall++;
    this.lastTranscriptAt = Date.now();
    this.trimWindow();
  }

  getWindow(): TranscriptLine[] {
    this.trimWindow();
    return [...this.window];
  }

  get newLinesSinceLastCall(): number {
    return this._newLinesSinceLastCall;
  }

  resetNewLines(): void {
    this._newLinesSinceLastCall = 0;
  }

  isSilent(): boolean {
    if (this.lastTranscriptAt === null) return false;
    return Date.now() - this.lastTranscriptAt > SILENCE_THRESHOLD_MS;
  }

  setCompetitors(names: string[]): void {
    this.competitors = names.map(n => n.toLowerCase());
  }

  detectKeyword(text: string): 'pricing' | 'competitor' | null {
    const lower = text.toLowerCase();
    if (PRICING_KEYWORDS.some(k => lower.includes(k))) return 'pricing';
    if (this.competitors.some(c => lower.includes(c))) return 'competitor';
    return null;
  }

  private trimWindow(): void {
    const cutoff = Date.now() - WINDOW_DURATION_MS;
    this.window = this.window.filter(l => l.timestamp >= cutoff);
  }
}
