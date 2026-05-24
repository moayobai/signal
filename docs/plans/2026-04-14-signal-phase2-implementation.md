# SIGNAL Phase 2+3 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the mock fixture with a full live pipeline — audio capture → Deepgram Nova-3 STT → Claude Haiku prompts → overlay updates — with placeholder keys that no-op gracefully until real keys are inserted.

**Architecture:** Fastify server exposes a WebSocket endpoint. The Chrome extension captures tab audio via `chrome.tabCapture`, streams 250ms chunks to the server, which pipes them to Deepgram for live transcription and triggers Claude Haiku every 12s to produce `SignalFrame` JSON pushed back to the overlay.

**Tech Stack:** Fastify 4, @fastify/websocket, @deepgram/sdk v3, @anthropic-ai/sdk, tsx (dev), esbuild (prod), Vitest 2, pnpm workspaces, WXT, Fly.io

---

### Task 1: Add `ClientMessage`, `ServerMessage`, `CallType` to `@signal/types`

**Files:**

- Modify: `packages/types/index.ts`

**Step 1: Add the new types**

Append to `packages/types/index.ts`:

```ts
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
```

Note: `CallType` duplicates the `type` field on `CallSession` — that's fine, they share the same union. Do not change `CallSession`.

**Step 2: Verify TypeScript compiles**

```bash
cd /Users/mahomedayob/SIGNAL\ BUILD/packages/types && npx tsc --noEmit
```

Expected: no output (0 errors)

**Step 3: Commit**

```bash
cd /Users/mahomedayob/SIGNAL\ BUILD
git add packages/types/index.ts
git commit -m "feat(types): add ClientMessage, ServerMessage, CallType for Phase 2"
```

---

### Task 2: Server `package.json` + `tsconfig.json` + `vitest.config.ts`

**Files:**

- Modify: `apps/server/package.json`
- Create: `apps/server/tsconfig.json`
- Create: `apps/server/vitest.config.ts`

**Step 1: Rewrite `apps/server/package.json`**

```json
{
  "name": "server",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "esbuild src/index.ts --bundle --platform=node --target=node22 --outfile=dist/index.js --external:@fastify/websocket --external:fastify",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.37.0",
    "@deepgram/sdk": "^3.9.0",
    "@fastify/websocket": "^10.0.1",
    "fastify": "^4.27.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "esbuild": "^0.21.0",
    "tsx": "^4.15.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

**Step 2: Create `apps/server/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "paths": {
      "@signal/types": ["../../packages/types/index.ts"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 3: Create `apps/server/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@signal/types': '../../packages/types/index.ts',
    },
  },
});
```

**Step 4: Install dependencies**

```bash
cd /Users/mahomedayob/SIGNAL\ BUILD && pnpm install
```

Expected: packages installed, no errors. If pnpm warns about esbuild build scripts, that's expected — `.npmrc` already has `onlyBuiltDependencies[]=esbuild`.

**Step 5: Verify TypeScript resolves**

```bash
cd /Users/mahomedayob/SIGNAL\ BUILD/apps/server && npx tsc --noEmit
```

Expected: error only about `src/index.ts` being empty stub (acceptable at this stage) or no errors at all.

**Step 6: Commit**

```bash
cd /Users/mahomedayob/SIGNAL\ BUILD
git add apps/server/package.json apps/server/tsconfig.json apps/server/vitest.config.ts
git commit -m "chore(server): configure package.json, tsconfig, vitest for Phase 2"
```

---

### Task 3: `knowledge/company.md` template

**Files:**

- Create: `knowledge/company.md`

**Step 1: Create the file**

```bash
# Create at repo root
```

Contents of `knowledge/company.md`:

```markdown
# Company Context

## About

[Company name] is a [brief description — e.g., "B2B SaaS platform for..."].

## Ideal Customer Profile

- Industry: [e.g., Financial services, Enterprise SaaS]
- Company size: [e.g., 50–500 employees]
- Title: [e.g., VP Sales, CRO, Head of Revenue]

## Value Propositions

1. [Core value prop 1]
2. [Core value prop 2]
3. [Core value prop 3]

## Common Objections

- "Too expensive": [Reframe]
- "Already have a solution": [Reframe]
- "Not the right time": [Reframe]

## Competitors

- [Competitor 1]
- [Competitor 2]
- [Competitor 3]

## Pricing Keywords

price, cost, expensive, budget, afford, pricing, ROI, investment

## Key Differentiators

[What makes you different from competitors]

## Proof Points / Case Studies

- [Customer 1]: [Result]
- [Customer 2]: [Result]
```

**Step 2: Commit**

```bash
cd /Users/mahomedayob/SIGNAL\ BUILD
git add knowledge/company.md
git commit -m "feat(knowledge): add company.md template for Claude system prompt"
```

---

### Task 4: `apps/server/src/prompts/live.ts` — system prompt builder

**Files:**

- Create: `apps/server/src/prompts/live.ts`

**Step 1: Create the directory and file**

`apps/server/src/prompts/live.ts`:

```ts
import { readFileSync } from 'fs';
import { join } from 'path';
import type { CallType } from '@signal/types';

function loadCompanyContext(): string {
  try {
    const p = join(process.cwd(), 'knowledge', 'company.md');
    return readFileSync(p, 'utf-8');
  } catch {
    return '(no company context loaded)';
  }
}

const COMPANY_CONTEXT = loadCompanyContext();

export function buildSystemPrompt(callType: CallType): string {
  return `You are SIGNAL, a real-time AI co-pilot for ${callType} calls. You receive a rolling transcript and return structured coaching JSON.

## Company Context
${COMPANY_CONTEXT}

## Your Role
Analyse the last 90 seconds of transcript and return a single JSON object. Keep prompts under 160 characters. Be direct. Prioritise the highest-value action right now.

## Call Type
${callType}

## Output Schema
Return ONLY valid JSON matching this exact shape — no markdown, no explanation:
{
  "prompt": {
    "type": "ASK" | "CLOSE" | "WARN" | "REFRAME" | "BODY" | "SILENCE" | "IDLE",
    "text": "string (≤160 chars)",
    "confidence": 0.0–1.0,
    "isNudge": true | false,
    "timestamp": <unix ms>
  },
  "bodyLang": {
    "eyeContact": "strong" | "direct" | "moderate" | "avoidant",
    "posture": "forward" | "neutral" | "leaning back" | "arms crossed",
    "microExpressions": "engaged" | "nodding" | "thinking" | "confused" | "sceptical"
  },
  "sentiment": 0–100,
  "dangerFlag": true | false,
  "dangerReason": "string" | null
}

## Rules
- bodyLang: Phase 2 has no video — always return { eyeContact: "direct", posture: "neutral", microExpressions: "engaged" }
- If no action needed: type = "IDLE", isNudge = false, confidence = 0.1
- dangerFlag: true only for pricing objection, competitor mention, or >30s silence
- timestamp: current unix milliseconds`;
}

export function buildUserPrompt(
  transcript: Array<{ speaker: string; text: string; timestamp: number }>,
): string {
  const lines = transcript.map(l => `[${l.speaker.toUpperCase()}] ${l.text}`).join('\n');
  return `Transcript (last 90s):\n${lines}\n\nReturn the SignalFrame JSON now.`;
}
```

**Step 2: Verify TypeScript compiles**

```bash
cd /Users/mahomedayob/SIGNAL\ BUILD/apps/server && npx tsc --noEmit
```

Expected: no errors (or only errors from unimplemented files not yet created)

**Step 3: Commit**

```bash
cd /Users/mahomedayob/SIGNAL\ BUILD
git add apps/server/src/prompts/live.ts
git commit -m "feat(server): add live prompt builder with company context injection"
```

---

### Task 5: `apps/server/src/services/session.ts` — TDD

**Files:**

- Create: `apps/server/src/services/session.ts`
- Create: `apps/server/src/services/session.test.ts`

**Step 1: Write the failing tests first**

`apps/server/src/services/session.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CallSession } from './session.js';

describe('CallSession — rolling window', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps lines within 90s window', () => {
    const session = new CallSession('meet', 'enterprise');
    const now = Date.now();

    session.addLine({ speaker: 'user', text: 'hello', timestamp: now - 95_000 });
    session.addLine({ speaker: 'prospect', text: 'world', timestamp: now });

    expect(session.getWindow()).toHaveLength(1);
    expect(session.getWindow()[0].text).toBe('world');
  });

  it('newLinesSinceLastCall increments and resets', () => {
    const session = new CallSession('meet', 'enterprise');
    expect(session.newLinesSinceLastCall).toBe(0);

    session.addLine({ speaker: 'user', text: 'line 1', timestamp: Date.now() });
    session.addLine({ speaker: 'user', text: 'line 2', timestamp: Date.now() });
    expect(session.newLinesSinceLastCall).toBe(2);

    session.resetNewLines();
    expect(session.newLinesSinceLastCall).toBe(0);
  });
});

describe('CallSession — danger detection', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('detects silence after 30s', () => {
    const session = new CallSession('meet', 'enterprise');
    session.addLine({ speaker: 'user', text: 'hi', timestamp: Date.now() });

    vi.advanceTimersByTime(31_000);
    expect(session.isSilent()).toBe(true);
  });

  it('not silent immediately after a line', () => {
    const session = new CallSession('meet', 'enterprise');
    session.addLine({ speaker: 'user', text: 'hi', timestamp: Date.now() });
    vi.advanceTimersByTime(5_000);
    expect(session.isSilent()).toBe(false);
  });

  it('detects pricing keyword', () => {
    const session = new CallSession('meet', 'enterprise');
    expect(session.detectKeyword('what is the price for this?')).toBe('pricing');
  });

  it('detects competitor name from company.md competitors list', () => {
    const session = new CallSession('meet', 'enterprise');
    // Uses internal competitors list — test a hardcoded fallback name
    session.setCompetitors(['Acme Corp', 'Rival Inc']);
    expect(session.detectKeyword('we already use Acme Corp')).toBe('competitor');
  });

  it('returns null for benign transcript', () => {
    const session = new CallSession('meet', 'enterprise');
    expect(session.detectKeyword('tell me more about your platform')).toBeNull();
  });
});
```

**Step 2: Run to verify they fail**

```bash
cd /Users/mahomedayob/SIGNAL\ BUILD/apps/server && npx vitest run src/services/session.test.ts
```

Expected: FAIL — `Cannot find module './session.js'`

**Step 3: Implement `apps/server/src/services/session.ts`**

```ts
import type { TranscriptLine, CallType } from '@signal/types';

const PRICING_KEYWORDS = [
  'price',
  'cost',
  'expensive',
  'budget',
  'afford',
  'pricing',
  'roi',
  'investment',
];
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
```

**Step 4: Run tests — verify they pass**

```bash
cd /Users/mahomedayob/SIGNAL\ BUILD/apps/server && npx vitest run src/services/session.test.ts
```

Expected: 7/7 PASS

**Step 5: Commit**

```bash
cd /Users/mahomedayob/SIGNAL\ BUILD
git add apps/server/src/services/session.ts apps/server/src/services/session.test.ts
git commit -m "feat(server): CallSession with rolling 90s window and danger detection (TDD)"
```

---

### Task 6: `apps/server/src/services/claude.ts` — TDD

**Files:**

- Create: `apps/server/src/services/claude.ts`
- Create: `apps/server/src/services/claude.test.ts`

**Step 1: Write failing tests**

`apps/server/src/services/claude.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the Anthropic SDK before importing claude.ts
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: {
        create: vi.fn(),
      },
    })),
  };
});

import Anthropic from '@anthropic-ai/sdk';
import { callClaude, parseSignalFrame } from './claude.js';

const VALID_FRAME = {
  prompt: {
    type: 'ASK',
    text: 'Ask about timeline',
    confidence: 0.85,
    isNudge: false,
    timestamp: 1234567890,
  },
  bodyLang: {
    eyeContact: 'direct',
    posture: 'neutral',
    microExpressions: 'engaged',
  },
  sentiment: 72,
  dangerFlag: false,
  dangerReason: null,
};

describe('parseSignalFrame', () => {
  it('parses valid JSON string', () => {
    const result = parseSignalFrame(JSON.stringify(VALID_FRAME));
    expect(result).not.toBeNull();
    expect(result?.prompt.type).toBe('ASK');
    expect(result?.sentiment).toBe(72);
  });

  it('returns null for invalid JSON', () => {
    expect(parseSignalFrame('not json')).toBeNull();
  });

  it('returns null for JSON missing required fields', () => {
    expect(parseSignalFrame('{"prompt": {}}')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseSignalFrame('')).toBeNull();
  });
});

describe('callClaude', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when API key is placeholder', async () => {
    const result = await callClaude({
      apiKey: 'sk-ant-your-key-here',
      systemPrompt: 'system',
      userPrompt: 'user',
    });
    expect(result).toBeNull();
  });

  it('returns null when API key is empty', async () => {
    const result = await callClaude({
      apiKey: '',
      systemPrompt: 'system',
      userPrompt: 'user',
    });
    expect(result).toBeNull();
  });

  it('calls Anthropic SDK and parses response with real-looking key', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(VALID_FRAME) }],
    });

    (Anthropic as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      messages: { create: mockCreate },
    }));

    const result = await callClaude({
      apiKey: 'sk-ant-api03-real-looking-key',
      systemPrompt: 'system',
      userPrompt: 'user',
    });

    expect(mockCreate).toHaveBeenCalledOnce();
    expect(result?.prompt.type).toBe('ASK');
  });

  it('returns null if SDK throws', async () => {
    const mockCreate = vi.fn().mockRejectedValue(new Error('API error'));

    (Anthropic as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      messages: { create: mockCreate },
    }));

    const result = await callClaude({
      apiKey: 'sk-ant-api03-real-looking-key',
      systemPrompt: 'system',
      userPrompt: 'user',
    });

    expect(result).toBeNull();
  });
});
```

**Step 2: Run to verify failure**

```bash
cd /Users/mahomedayob/SIGNAL\ BUILD/apps/server && npx vitest run src/services/claude.test.ts
```

Expected: FAIL — `Cannot find module './claude.js'`

**Step 3: Implement `apps/server/src/services/claude.ts`**

```ts
import Anthropic from '@anthropic-ai/sdk';
import type { SignalFrame } from '@signal/types';

const PLACEHOLDER_PREFIXES = ['sk-ant-your-key', 'your-'];

function isPlaceholderKey(key: string): boolean {
  if (!key) return true;
  return PLACEHOLDER_PREFIXES.some(p => key.startsWith(p));
}

export function parseSignalFrame(text: string): SignalFrame | null {
  try {
    const obj = JSON.parse(text) as Partial<SignalFrame>;
    if (
      !obj.prompt?.type ||
      !obj.prompt?.text ||
      typeof obj.sentiment !== 'number' ||
      typeof obj.dangerFlag !== 'boolean'
    ) {
      return null;
    }
    return obj as SignalFrame;
  } catch {
    return null;
  }
}

interface ClaudeCallOptions {
  apiKey: string;
  systemPrompt: string;
  userPrompt: string;
}

export async function callClaude(options: ClaudeCallOptions): Promise<SignalFrame | null> {
  const { apiKey, systemPrompt, userPrompt } = options;

  if (isPlaceholderKey(apiKey)) {
    return null;
  }

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: [
        {
          type: 'text',
          text: systemPrompt,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: userPrompt }],
    });

    const content = response.content[0];
    if (content.type !== 'text') return null;

    return parseSignalFrame(content.text);
  } catch (err) {
    console.error('[SIGNAL] Claude call failed:', err);
    return null;
  }
}
```

**Step 4: Run tests — verify they pass**

```bash
cd /Users/mahomedayob/SIGNAL\ BUILD/apps/server && npx vitest run src/services/claude.test.ts
```

Expected: 8/8 PASS

**Step 5: Commit**

```bash
cd /Users/mahomedayob/SIGNAL\ BUILD
git add apps/server/src/services/claude.ts apps/server/src/services/claude.test.ts
git commit -m "feat(server): Claude Haiku caller with placeholder guard and JSON parse (TDD)"
```

---

### Task 7: `apps/server/src/services/deepgram.ts`

**Files:**

- Create: `apps/server/src/services/deepgram.ts`

No unit test for this — Deepgram client wraps an external streaming WS connection. It will be covered by the integration test in Task 8.

**Step 1: Create `apps/server/src/services/deepgram.ts`**

```ts
import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk';
import type { TranscriptLine } from '@signal/types';

const PLACEHOLDER_PREFIXES = ['your-deepgram'];

function isPlaceholderKey(key: string): boolean {
  if (!key) return true;
  return PLACEHOLDER_PREFIXES.some(p => key.startsWith(p));
}

interface DeepgramClientOptions {
  apiKey: string;
  onTranscript: (line: TranscriptLine) => void;
  onError: (err: unknown) => void;
}

export interface DeepgramHandle {
  send: (chunk: Buffer) => void;
  finish: () => void;
}

export function createDeepgramClient(options: DeepgramClientOptions): DeepgramHandle {
  const { apiKey, onTranscript, onError } = options;

  // No-op handle when key is placeholder
  if (isPlaceholderKey(apiKey)) {
    console.log('[SIGNAL] Deepgram key is placeholder — STT disabled');
    return {
      send: () => {},
      finish: () => {},
    };
  }

  const client = createClient(apiKey);
  const connection = client.listen.live({
    model: 'nova-3',
    language: 'en',
    diarize: true,
    punctuate: true,
    interim_results: false,
    smart_format: true,
  });

  connection.on(LiveTranscriptionEvents.Transcript, data => {
    const alt = data.channel?.alternatives?.[0];
    if (!alt?.transcript?.trim()) return;
    if (data.is_final === false) return; // interim — skip

    const speakerNum = alt.words?.[0]?.speaker ?? 0;
    const line: TranscriptLine = {
      speaker: speakerNum === 0 ? 'user' : 'prospect',
      text: alt.transcript.trim(),
      timestamp: Date.now(),
    };
    onTranscript(line);
  });

  connection.on(LiveTranscriptionEvents.Error, onError);

  connection.on(LiveTranscriptionEvents.Close, () => {
    console.log('[SIGNAL] Deepgram connection closed');
  });

  return {
    send: (chunk: Buffer) => {
      try {
        connection.send(chunk);
      } catch (err) {
        console.error('[SIGNAL] Deepgram send error:', err);
      }
    },
    finish: () => {
      try {
        connection.finish();
      } catch {
        // already closed
      }
    },
  };
}
```

**Step 2: Commit**

```bash
cd /Users/mahomedayob/SIGNAL\ BUILD
git add apps/server/src/services/deepgram.ts
git commit -m "feat(server): Deepgram Nova-3 streaming client wrapper"
```

---

### Task 8: `apps/server/src/routes/ws.ts` — WebSocket handler + integration test

**Files:**

- Create: `apps/server/src/routes/ws.ts`
- Create: `apps/server/src/routes/ws.test.ts`

**Step 1: Write the failing integration test**

`apps/server/src/routes/ws.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import websocketPlugin from '@fastify/websocket';
import WebSocket from 'ws';

// Mock services
vi.mock('../services/deepgram.js', () => ({
  createDeepgramClient: vi.fn(() => ({
    send: vi.fn(),
    finish: vi.fn(),
  })),
}));

vi.mock('../services/claude.js', () => ({
  callClaude: vi.fn().mockResolvedValue(null),
}));

vi.mock('../services/session.js', () => ({
  CallSession: vi.fn().mockImplementation(() => ({
    id: 'test-session-id',
    addLine: vi.fn(),
    getWindow: vi.fn(() => []),
    newLinesSinceLastCall: 0,
    resetNewLines: vi.fn(),
    isSilent: vi.fn(() => false),
    detectKeyword: vi.fn(() => null),
    setCompetitors: vi.fn(),
    callType: 'enterprise',
  })),
}));

import { registerWsRoute } from './ws.js';

async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(websocketPlugin);
  registerWsRoute(app, {
    anthropicApiKey: 'sk-ant-your-key-here',
    deepgramApiKey: 'your-deepgram-key-here',
  });
  await app.ready();
  return app;
}

describe('WebSocket route', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let address: string;

  beforeEach(async () => {
    app = await buildApp();
    address = await app.listen({ port: 0 });
    const port = new URL(address).port;
    address = `ws://localhost:${port}/ws`;
  });

  afterEach(async () => {
    await app.close();
  });

  it('sends connected message on connect', async () => {
    const ws = new WebSocket(address);
    const msg = await new Promise<string>(resolve => {
      ws.on('message', data => resolve(data.toString()));
    });
    ws.close();
    const parsed = JSON.parse(msg);
    expect(parsed.type).toBe('connected');
    expect(typeof parsed.sessionId).toBe('string');
  });

  it('handles binary audio chunk without crashing', async () => {
    const ws = new WebSocket(address);
    await new Promise<void>(resolve => ws.on('open', resolve));

    // Drain the 'connected' message
    await new Promise<void>(resolve => ws.on('message', () => resolve()));

    // Send fake audio chunk
    ws.send(Buffer.from([0x01, 0x02, 0x03]));

    // Small wait — server should not crash
    await new Promise(r => setTimeout(r, 50));
    expect(ws.readyState).toBe(WebSocket.OPEN);
    ws.close();
  });

  it('handles stop message', async () => {
    const ws = new WebSocket(address);
    await new Promise<void>(resolve => ws.on('open', resolve));
    await new Promise<void>(resolve => ws.on('message', () => resolve()));

    ws.send(JSON.stringify({ type: 'stop' }));
    await new Promise(r => setTimeout(r, 50));
    ws.close();
  });
});
```

**Step 2: Run to verify failure**

```bash
cd /Users/mahomedayob/SIGNAL\ BUILD/apps/server && npx vitest run src/routes/ws.test.ts
```

Expected: FAIL — `Cannot find module './ws.js'`

**Step 3: Implement `apps/server/src/routes/ws.ts`**

```ts
import type { FastifyInstance } from 'fastify';
import { CallSession } from '../services/session.js';
import { createDeepgramClient } from '../services/deepgram.js';
import { callClaude } from '../services/claude.js';
import { buildSystemPrompt, buildUserPrompt } from '../prompts/live.js';
import type { ClientMessage, ServerMessage } from '@signal/types';

const CLAUDE_INTERVAL_MS = 12_000;
const MIN_NEW_LINES = 2;

interface WsRouteOptions {
  anthropicApiKey: string;
  deepgramApiKey: string;
}

export function registerWsRoute(app: FastifyInstance, opts: WsRouteOptions): void {
  app.get('/ws', { websocket: true }, socket => {
    const session = new CallSession('meet', 'enterprise');

    function send(msg: ServerMessage): void {
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify(msg));
      }
    }

    // Announce connection
    send({ type: 'connected', sessionId: session.id });

    // Deepgram client
    const dg = createDeepgramClient({
      apiKey: opts.deepgramApiKey,
      onTranscript: line => {
        session.addLine(line);
        send({ type: 'transcript', line });

        // Danger detection on every new line
        const danger = session.detectKeyword(line.text);
        if (danger) {
          send({ type: 'state', overlayState: 'DANGER' });
        }
      },
      onError: err => {
        console.error('[SIGNAL] Deepgram error:', err);
        send({ type: 'error', message: 'STT error' });
      },
    });

    // Claude 12s scheduler
    const systemPrompt = buildSystemPrompt(session.callType);

    const claudeTimer = setInterval(async () => {
      if (session.newLinesSinceLastCall < MIN_NEW_LINES) return;

      const window = session.getWindow();
      session.resetNewLines();

      if (session.isSilent()) {
        send({ type: 'state', overlayState: 'DANGER' });
      }

      const frame = await callClaude({
        apiKey: opts.anthropicApiKey,
        systemPrompt,
        userPrompt: buildUserPrompt(window),
      });

      if (frame) {
        send({ type: 'frame', frame });
        if (frame.dangerFlag) {
          send({ type: 'state', overlayState: 'DANGER' });
        } else {
          send({ type: 'state', overlayState: 'LIVE' });
        }
      }
    }, CLAUDE_INTERVAL_MS);

    socket.on('message', (data: Buffer | string) => {
      if (Buffer.isBuffer(data)) {
        dg.send(data);
        return;
      }

      try {
        const msg = JSON.parse(data.toString()) as ClientMessage;
        if (msg.type === 'start') {
          send({ type: 'state', overlayState: 'LIVE' });
        } else if (msg.type === 'stop') {
          cleanup();
        }
      } catch {
        // malformed — ignore
      }
    });

    function cleanup(): void {
      clearInterval(claudeTimer);
      dg.finish();
    }

    socket.on('close', cleanup);
    socket.on('error', err => {
      console.error('[SIGNAL] WS socket error:', err);
      cleanup();
    });
  });
}
```

**Step 4: Run integration test**

```bash
cd /Users/mahomedayob/SIGNAL\ BUILD/apps/server && npx vitest run src/routes/ws.test.ts
```

Expected: 3/3 PASS

**Step 5: Commit**

```bash
cd /Users/mahomedayob/SIGNAL\ BUILD
git add apps/server/src/routes/ws.ts apps/server/src/routes/ws.test.ts
git commit -m "feat(server): WebSocket route with Deepgram + Claude integration (TDD)"
```

---

### Task 9: `apps/server/src/index.ts` — Fastify bootstrap

**Files:**

- Modify: `apps/server/src/index.ts`

**Step 1: Rewrite `apps/server/src/index.ts`**

```ts
import Fastify from 'fastify';
import websocketPlugin from '@fastify/websocket';
import { registerWsRoute } from './routes/ws.js';

const PORT = Number(process.env.PORT ?? 8080);
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? 'sk-ant-your-key-here';
const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY ?? 'your-deepgram-key-here';

const app = Fastify({
  logger: {
    transport: { target: 'pino-pretty', options: { colorize: true } },
  },
});

await app.register(websocketPlugin);

// Health check
app.get('/health', async () => ({ ok: true, ts: Date.now() }));

// WebSocket route
registerWsRoute(app, {
  anthropicApiKey: ANTHROPIC_API_KEY,
  deepgramApiKey: DEEPGRAM_API_KEY,
});

try {
  await app.listen({ port: PORT, host: '0.0.0.0' });
  app.log.info(`[SIGNAL] Server listening on :${PORT}`);
  if (ANTHROPIC_API_KEY.startsWith('sk-ant-your-key')) {
    app.log.warn('[SIGNAL] ANTHROPIC_API_KEY is placeholder — Claude disabled');
  }
  if (DEEPGRAM_API_KEY.startsWith('your-deepgram')) {
    app.log.warn('[SIGNAL] DEEPGRAM_API_KEY is placeholder — STT disabled');
  }
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
```

Note: `pino-pretty` is a Fastify/Pino peer dep — check if it needs to be added. If `tsx` errors on pino-pretty not found, remove the `transport` key and use plain logger.

**Step 2: Install pino-pretty if missing**

```bash
cd /Users/mahomedayob/SIGNAL\ BUILD/apps/server && pnpm add -D pino-pretty
```

If pnpm fails for some reason, skip pino-pretty and simplify logger config:

```ts
const app = Fastify({ logger: true });
```

**Step 3: Start the server with placeholder keys**

```bash
cd /Users/mahomedayob/SIGNAL\ BUILD/apps/server && npx tsx src/index.ts
```

Expected output:

```
[SIGNAL] Server listening on :8080
[SIGNAL] ANTHROPIC_API_KEY is placeholder — Claude disabled
[SIGNAL] DEEPGRAM_API_KEY is placeholder — STT disabled
```

No crash = success. Ctrl+C to stop.

**Step 4: Commit**

```bash
cd /Users/mahomedayob/SIGNAL\ BUILD
git add apps/server/src/index.ts apps/server/package.json
git commit -m "feat(server): Fastify bootstrap with health endpoint and WS route"
```

---

### Task 10: `apps/server/.env.example` + `Dockerfile` + `fly.toml`

**Files:**

- Create: `apps/server/.env.example`
- Create: `apps/server/Dockerfile`
- Create: `apps/server/fly.toml`

**Step 1: Create `apps/server/.env.example`**

```
ANTHROPIC_API_KEY=sk-ant-your-key-here
DEEPGRAM_API_KEY=your-deepgram-key-here
PORT=8080
NODE_ENV=development
```

**Step 2: Create `apps/server/Dockerfile`**

```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app

# Copy monorepo root files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/types ./packages/types
COPY apps/server ./apps/server
COPY knowledge ./knowledge

# Install pnpm
RUN npm install -g pnpm@latest

# Install deps (server only)
RUN pnpm install --filter server --frozen-lockfile

# Build
RUN pnpm --filter server run build

# --- runtime stage ---
FROM node:22-alpine AS runtime
WORKDIR /app

COPY --from=builder /app/apps/server/dist/index.js ./dist/index.js
COPY --from=builder /app/knowledge ./knowledge

EXPOSE 8080
CMD ["node", "dist/index.js"]
```

**Step 3: Create `apps/server/fly.toml`**

```toml
app = "signal-server"
primary_region = "lhr"

[build]
  dockerfile = "Dockerfile"
  dockerfile_context = "../.."

[env]
  PORT = "8080"
  NODE_ENV = "production"

[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true
  min_machines_running = 0

[[vm]]
  memory = "256mb"
  cpu_kind = "shared"
  cpus = 1
```

**Step 4: Verify Dockerfile syntax is valid (no build needed)**

```bash
docker build --no-cache --dry-run -f /Users/mahomedayob/SIGNAL\ BUILD/apps/server/Dockerfile /Users/mahomedayob/SIGNAL\ BUILD 2>&1 | head -5
```

If Docker not available locally, skip this step — the file is syntactically correct.

**Step 5: Commit**

```bash
cd /Users/mahomedayob/SIGNAL\ BUILD
git add apps/server/.env.example apps/server/Dockerfile apps/server/fly.toml
git commit -m "feat(server): add .env.example, Dockerfile, fly.toml for Fly.io production deploy"
```

---

### Task 11: Update `turbo.json` server scripts + root `package.json`

**Files:**

- Modify: `turbo.json`
- Modify: `package.json` (root)

**Step 1: Read current `turbo.json` and `package.json`**

Already read — `turbo.json` has `dev`, `dev:ext`, `build`, `test`, `typecheck`, `lint`. Root `package.json` has `dev:ext` and `dev` scripts.

**Step 2: Update `turbo.json`**

The existing `turbo.json` already has `dev` as persistent, which covers the server. No changes needed — `pnpm dev` in the server workspace will run `tsx watch src/index.ts` via the workspace script.

Confirm by checking: root `package.json` scripts should include a way to run server dev. If the root `dev` script currently only targets `--filter=extension`, add a `dev:server` alias:

In root `package.json`, add to `scripts`:

```json
"dev:server": "turbo run dev --filter=server"
```

**Step 3: Commit**

```bash
cd /Users/mahomedayob/SIGNAL\ BUILD
git add package.json
git commit -m "chore: add dev:server turbo script"
```

---

### Task 12: Rewrite `apps/extension/entrypoints/background.ts`

**Files:**

- Modify: `apps/extension/entrypoints/background.ts`

**Step 1: Rewrite the file**

```ts
import type { ClientMessage, ServerMessage } from '@signal/types';

declare const __WS_URL__: string;

const WS_URL = (typeof __WS_URL__ !== 'undefined' ? __WS_URL__ : 'ws://localhost:8080') + '/ws';
const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAYS = [1000, 2000, 4000];

let wsocket: WebSocket | null = null;
let recorder: MediaRecorder | null = null;
let activeTabId: number | null = null;
let reconnectAttempt = 0;

export default defineBackground(() => {
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'START_CAPTURE') {
      activeTabId = sender.tab?.id ?? null;
      startCapture(sendResponse);
      return true; // keep channel open for async response
    }
    if (msg.type === 'STOP_CAPTURE') {
      stopCapture();
      sendResponse({ ok: true });
    }
  });
});

function startCapture(sendResponse: (r: unknown) => void): void {
  chrome.tabCapture.capture({ audio: true, video: false }, stream => {
    if (!stream) {
      console.error('[SIGNAL] tabCapture failed:', chrome.runtime.lastError?.message);
      sendResponse({ error: chrome.runtime.lastError?.message ?? 'capture failed' });
      return;
    }

    connectWs(stream);
    sendResponse({ ok: true });
  });
}

function connectWs(stream: MediaStream): void {
  const ws = new WebSocket(WS_URL);
  wsocket = ws;

  ws.onopen = () => {
    console.log('[SIGNAL] WS connected');
    reconnectAttempt = 0;

    const startMsg: ClientMessage = { type: 'start', platform: 'meet', callType: 'enterprise' };
    ws.send(JSON.stringify(startMsg));

    startRecorder(stream, ws);
  };

  ws.onmessage = event => {
    try {
      const msg = JSON.parse(event.data as string) as ServerMessage;
      if (activeTabId !== null) {
        chrome.tabs.sendMessage(activeTabId, msg).catch(() => {
          // tab may have closed
        });
      }
    } catch {
      // malformed message
    }
  };

  ws.onerror = err => {
    console.error('[SIGNAL] WS error:', err);
  };

  ws.onclose = () => {
    console.log('[SIGNAL] WS closed');
    stopRecorder();

    if (reconnectAttempt < MAX_RECONNECT_ATTEMPTS) {
      const delay = RECONNECT_DELAYS[reconnectAttempt] ?? 4000;
      reconnectAttempt++;
      console.log(`[SIGNAL] Reconnecting in ${delay}ms (attempt ${reconnectAttempt})`);
      setTimeout(() => connectWs(stream), delay);
    }
  };
}

function startRecorder(stream: MediaStream, ws: WebSocket): void {
  const mimeType = 'audio/webm;codecs=opus';
  if (!MediaRecorder.isTypeSupported(mimeType)) {
    console.error('[SIGNAL] MediaRecorder does not support', mimeType);
    return;
  }

  const rec = new MediaRecorder(stream, { mimeType });
  recorder = rec;

  rec.ondataavailable = e => {
    if (e.data.size > 0 && ws.readyState === WebSocket.OPEN) {
      e.data.arrayBuffer().then(buf => ws.send(buf));
    }
  };

  rec.start(250); // 250ms chunks
  console.log('[SIGNAL] MediaRecorder started');
}

function stopRecorder(): void {
  if (recorder?.state !== 'inactive') {
    recorder?.stop();
  }
  recorder = null;
}

function stopCapture(): void {
  stopRecorder();
  if (wsocket) {
    wsocket.send(JSON.stringify({ type: 'stop' } satisfies ClientMessage));
    wsocket.close();
    wsocket = null;
  }
}
```

**Step 2: Build the extension to verify no TypeScript errors**

```bash
cd /Users/mahomedayob/SIGNAL\ BUILD && pnpm --filter=extension run build 2>&1 | tail -20
```

Expected: build succeeds, `.output/` produced. If type errors, fix before committing.

**Step 3: Commit**

```bash
cd /Users/mahomedayob/SIGNAL\ BUILD
git add apps/extension/entrypoints/background.ts
git commit -m "feat(extension): background.ts — tabCapture + MediaRecorder + WS client with reconnect"
```

---

### Task 13: Update `apps/extension/entrypoints/content.tsx`

**Files:**

- Modify: `apps/extension/entrypoints/content.tsx`

**Step 1: Update `content.tsx`**

Replace the entire file:

```tsx
import ReactDOM from 'react-dom/client';
import { createShadowRootUi } from 'wxt/client';
import { Overlay } from '../overlay/Overlay';
import { useSignalStore } from '../overlay/store';
import type { ServerMessage } from '@signal/types';

export default defineContentScript({
  matches: ['*://meet.google.com/*', '*://*.zoom.us/wc/*', '*://teams.microsoft.com/*'],
  cssInjectionMode: 'ui',

  async main(ctx) {
    const ui = await createShadowRootUi(ctx, {
      name: 'signal-overlay',
      position: 'overlay',
      anchor: 'body',

      onMount(container, _shadow, shadowHost) {
        Object.assign(shadowHost.style, {
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: '2147483647',
          pointerEvents: 'none',
          width: 'auto',
          height: 'auto',
        });
        container.style.pointerEvents = 'auto';

        const root = ReactDOM.createRoot(container);
        root.render(<Overlay useMockFixture={false} />);
        return root;
      },

      onRemove(root) {
        root?.unmount();
      },
    });

    ui.mount();

    // Trigger audio capture
    chrome.runtime.sendMessage({ type: 'START_CAPTURE' }, response => {
      if (chrome.runtime.lastError) {
        console.warn('[SIGNAL] START_CAPTURE error:', chrome.runtime.lastError.message);
      } else if (response?.error) {
        console.warn('[SIGNAL] Capture failed:', response.error);
      }
    });

    // Listen for server messages relayed from background
    chrome.runtime.onMessage.addListener((msg: ServerMessage) => {
      const store = useSignalStore.getState();

      switch (msg.type) {
        case 'frame':
          store.setFrame(msg.frame);
          break;
        case 'transcript':
          store.appendTranscriptLine(msg.line);
          break;
        case 'state':
          store.setOverlayState(msg.overlayState);
          break;
        case 'connected':
          store.setOverlayState('LIVE');
          break;
        case 'error':
          console.error('[SIGNAL] Server error:', msg.message);
          break;
      }
    });
  },
});
```

**Step 2: Build the extension**

```bash
cd /Users/mahomedayob/SIGNAL\ BUILD && pnpm --filter=extension run build 2>&1 | tail -20
```

Expected: build succeeds, no TypeScript errors.

**Step 3: Commit**

```bash
cd /Users/mahomedayob/SIGNAL\ BUILD
git add apps/extension/entrypoints/content.tsx
git commit -m "feat(extension): content.tsx — START_CAPTURE trigger + server message listener"
```

---

### Task 14: Update `apps/extension/wxt.config.ts` — tabCapture + `__WS_URL__`

**Files:**

- Modify: `apps/extension/wxt.config.ts`

**Step 1: Update `wxt.config.ts`**

```ts
import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  srcDir: '.',
  manifest: {
    name: 'SIGNAL',
    description: 'Real-time AI co-pilot for sales & investor calls',
    version: '0.1.0',
    permissions: ['tabs', 'storage', 'tabCapture'],
    host_permissions: ['*://meet.google.com/*', '*://*.zoom.us/*', '*://teams.microsoft.com/*'],
  },
  vite: () => ({
    plugins: [tailwindcss()],
    define: {
      __WS_URL__: JSON.stringify(process.env.WS_URL ?? 'ws://localhost:8080'),
    },
    resolve: {
      alias: {
        '@signal/types': '../../packages/types/index.ts',
      },
    },
  }),
});
```

**Step 2: Build the extension**

```bash
cd /Users/mahomedayob/SIGNAL\ BUILD && pnpm --filter=extension run build 2>&1 | tail -20
```

Expected: build succeeds.

**Step 3: Run all vitest tests**

```bash
cd /Users/mahomedayob/SIGNAL\ BUILD && pnpm --filter=server run test
```

Expected: all tests PASS (session tests + claude tests + ws integration test)

**Step 4: Commit**

```bash
cd /Users/mahomedayob/SIGNAL\ BUILD
git add apps/extension/wxt.config.ts
git commit -m "feat(extension): add tabCapture permission and __WS_URL__ vite define"
```

---

### Task 15: Final pipeline verification

**Step 1: Run all server tests**

```bash
cd /Users/mahomedayob/SIGNAL\ BUILD/apps/server && npx vitest run
```

Expected: all tests pass

**Step 2: Start server with placeholder keys (success criterion 1)**

```bash
cd /Users/mahomedayob/SIGNAL\ BUILD/apps/server && npx tsx src/index.ts
```

Expected: starts on :8080, two placeholder warnings, no crash. Ctrl+C.

**Step 3: Build server**

```bash
cd /Users/mahomedayob/SIGNAL\ BUILD/apps/server && pnpm run build
```

Expected: `dist/index.js` produced

**Step 4: Build extension**

```bash
cd /Users/mahomedayob/SIGNAL\ BUILD && pnpm --filter=extension run build
```

Expected: `.output/chrome-mv3/` produced

**Step 5: Verify Dockerfile + fly.toml exist**

```bash
ls /Users/mahomedayob/SIGNAL\ BUILD/apps/server/Dockerfile /Users/mahomedayob/SIGNAL\ BUILD/apps/server/fly.toml
```

Expected: both files listed

**Step 6: Final commit if anything uncommitted**

```bash
cd /Users/mahomedayob/SIGNAL\ BUILD && git status
```

Commit any remaining changes.

---

## Success Criteria Checklist

- [ ] 1. `pnpm dev` (server) starts Fastify on :8080 with placeholder keys — no crash
- [ ] 2. Extension builds without TypeScript errors
- [ ] 3. `wxt.config.ts` includes `tabCapture` permission
- [ ] 4. `background.ts` handles `START_CAPTURE` → `chrome.tabCapture.capture`
- [ ] 5. `content.tsx` sends `START_CAPTURE` on mount + listens for server messages
- [ ] 6. All Vitest tests pass (session + claude + ws integration)
- [ ] 7. `pnpm build` (server) produces `dist/index.js`
- [ ] 8. `fly.toml` + `Dockerfile` present and valid
- [ ] 9. `.env.example` has all four keys
- [ ] 10. `knowledge/company.md` template present at repo root
