# SIGNAL Phase 4 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (or superpowers:subagent-driven-development for same-session execution) to implement this plan task-by-task.

**Goal:** Close the pre/post call loop — post-call summary, OctaMem integration, SQLite persistence, provider-agnostic AI, extension popup (prospect detection + pre/post UI), web dashboard (CRM + analytics).

**Architecture:** Monolith expansion of existing Fastify server. SQLite via Drizzle ORM on Fly volume. AI via `AIProvider` interface (Claude direct OR OpenRouter). Dashboard is Vite+React SPA in `apps/server/dashboard/`, built to `apps/server/public/`, served by `@fastify/static`. Extension popup added as new WXT entry point.

**Tech Stack:** Fastify 4, @fastify/static, @fastify/websocket, Drizzle ORM + better-sqlite3, @anthropic-ai/sdk, native fetch (OpenRouter + OctaMem), Vite + React 18 + TanStack Router + TanStack Query, WXT 0.19 + React.

**Design doc:** `docs/plans/2026-04-14-signal-phase4-design.md`

---

## Task 1: Update `packages/types` — prospect in ClientMessage, summary in ServerMessage

**Files:**

- Modify: `packages/types/index.ts`

**Step 1: Update `ClientMessage` start shape and add summary to `ServerMessage`**

Replace the `ClientMessage` and `ServerMessage` blocks with:

```ts
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
  | { type: 'stop' };

export type ServerMessage =
  | { type: 'connected'; sessionId: string }
  | { type: 'transcript'; line: TranscriptLine }
  | { type: 'frame'; frame: SignalFrame }
  | { type: 'state'; overlayState: OverlayState }
  | { type: 'summary'; summary: PostCallSummary }
  | { type: 'error'; message: string };
```

**Step 2: Verify typecheck (will currently fail downstream)**

Run: `cd apps/server && pnpm typecheck`
Expected: FAIL in `routes/ws.ts` and `services/claude.test.ts` references — this is fine, will be fixed in later tasks.

**Step 3: Commit**

```bash
git add packages/types/index.ts
git commit -m "feat(types): add Prospect + summary ServerMessage for Phase 4"
```

---

## Task 2: Install server dependencies

**Files:**

- Modify: `apps/server/package.json`

**Step 1: Install runtime + dev deps**

Run (from repo root):

```bash
pnpm --filter server add drizzle-orm better-sqlite3 @fastify/static
pnpm --filter server add -D @types/better-sqlite3 drizzle-kit
```

**Step 2: Verify versions in `apps/server/package.json`**

Expected additions:

- `drizzle-orm` ^0.33+
- `better-sqlite3` ^11+
- `@fastify/static` ^7+ (compatible with Fastify 4)
- devDeps: `@types/better-sqlite3`, `drizzle-kit`

**Step 3: Commit**

```bash
git add apps/server/package.json pnpm-lock.yaml
git commit -m "chore(server): add drizzle-orm, better-sqlite3, @fastify/static"
```

---

## Task 3: DB layer — `services/db.ts` (Drizzle schema + init)

**Files:**

- Create: `apps/server/src/services/db.ts`
- Test: `apps/server/src/services/db.test.ts`

**Step 1: Write the failing test**

```ts
// apps/server/src/services/db.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { initDb, contacts, callSessions } from './db.js';

describe('db', () => {
  let db: ReturnType<typeof initDb>;

  beforeEach(() => {
    db = initDb(':memory:');
  });

  it('creates contacts table and upserts a contact', () => {
    const now = Date.now();
    db.insert(contacts)
      .values({
        id: 'c1',
        name: 'James',
        company: 'Acme',
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const rows = db.select().from(contacts).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('James');
  });

  it('creates call_sessions table with FK to contacts', () => {
    const now = Date.now();
    db.insert(contacts).values({ id: 'c1', name: 'J', createdAt: now, updatedAt: now }).run();
    db.insert(callSessions)
      .values({
        id: 's1',
        contactId: 'c1',
        platform: 'meet',
        callType: 'investor',
        startedAt: now,
      })
      .run();
    const rows = db.select().from(callSessions).all();
    expect(rows[0].contactId).toBe('c1');
  });
});
```

**Step 2: Run test to see it fail**

Run: `cd apps/server && pnpm test -- db.test.ts`
Expected: FAIL — module `./db.js` not found.

**Step 3: Implement `services/db.ts`**

```ts
// apps/server/src/services/db.ts
import Database from 'better-sqlite3';
import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const contacts = sqliteTable('contacts', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email'),
  linkedinUrl: text('linkedin_url'),
  company: text('company'),
  role: text('role'),
  notes: text('notes'),
  octamemId: text('octamem_id'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const callSessions = sqliteTable('call_sessions', {
  id: text('id').primaryKey(),
  contactId: text('contact_id'),
  platform: text('platform').notNull(),
  callType: text('call_type').notNull(),
  startedAt: integer('started_at').notNull(),
  endedAt: integer('ended_at'),
  durationMs: integer('duration_ms'),
  sentimentAvg: real('sentiment_avg'),
});

export const transcriptLines = sqliteTable('transcript_lines', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sessionId: text('session_id').notNull(),
  speaker: text('speaker').notNull(),
  text: text('text').notNull(),
  timestamp: integer('timestamp').notNull(),
});

export const signalFrames = sqliteTable('signal_frames', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sessionId: text('session_id').notNull(),
  promptType: text('prompt_type').notNull(),
  promptText: text('prompt_text').notNull(),
  confidence: real('confidence').notNull(),
  sentiment: integer('sentiment').notNull(),
  dangerFlag: integer('danger_flag').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const callSummaries = sqliteTable('call_summaries', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().unique(),
  winSignals: text('win_signals').notNull(),
  objections: text('objections').notNull(),
  decisions: text('decisions').notNull(),
  followUpDraft: text('follow_up_draft').notNull(),
  createdAt: integer('created_at').notNull(),
});

export type DB = BetterSQLite3Database<Record<string, never>>;

const DDL = `
CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT, linkedin_url TEXT,
  company TEXT, role TEXT, notes TEXT, octamem_id TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS call_sessions (
  id TEXT PRIMARY KEY, contact_id TEXT, platform TEXT NOT NULL,
  call_type TEXT NOT NULL, started_at INTEGER NOT NULL, ended_at INTEGER,
  duration_ms INTEGER, sentiment_avg REAL
);
CREATE TABLE IF NOT EXISTS transcript_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL,
  speaker TEXT NOT NULL, text TEXT NOT NULL, timestamp INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS signal_frames (
  id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL,
  prompt_type TEXT NOT NULL, prompt_text TEXT NOT NULL, confidence REAL NOT NULL,
  sentiment INTEGER NOT NULL, danger_flag INTEGER NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS call_summaries (
  id TEXT PRIMARY KEY, session_id TEXT NOT NULL UNIQUE,
  win_signals TEXT NOT NULL, objections TEXT NOT NULL, decisions TEXT NOT NULL,
  follow_up_draft TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_call_sessions_contact ON call_sessions(contact_id);
CREATE INDEX IF NOT EXISTS idx_transcript_lines_session ON transcript_lines(session_id);
CREATE INDEX IF NOT EXISTS idx_signal_frames_session ON signal_frames(session_id);
`;

export function initDb(url: string): DB {
  const sqlite = new Database(url);
  sqlite.pragma('journal_mode = WAL');
  sqlite.exec(DDL);
  return drizzle(sqlite);
}
```

**Step 4: Run test to verify pass**

Run: `cd apps/server && pnpm test -- db.test.ts`
Expected: PASS (2/2).

**Step 5: Commit**

```bash
git add apps/server/src/services/db.ts apps/server/src/services/db.test.ts
git commit -m "feat(server): add Drizzle ORM schema and initDb"
```

---

## Task 4: AI provider abstraction — `services/ai.ts` + refactor `claude.ts`

**Files:**

- Create: `apps/server/src/services/ai.ts`
- Create: `apps/server/src/services/ai.test.ts`
- Modify: `apps/server/src/services/claude.ts`
- Modify: `apps/server/src/services/claude.test.ts`

**Step 1: Write the failing test for `ai.ts`**

```ts
// apps/server/src/services/ai.test.ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'hello' }] }),
    },
  })),
}));

import { createAIProvider, ClaudeProvider, OpenRouterProvider, NoOpProvider } from './ai.js';

describe('createAIProvider', () => {
  it('returns NoOpProvider when ANTHROPIC_API_KEY is placeholder', () => {
    const p = createAIProvider({
      provider: 'claude',
      anthropicApiKey: 'sk-ant-your-key-here',
      openrouterApiKey: '',
    });
    expect(p).toBeInstanceOf(NoOpProvider);
  });
  it('returns ClaudeProvider for real claude key', () => {
    const p = createAIProvider({
      provider: 'claude',
      anthropicApiKey: 'sk-ant-api03-real',
      openrouterApiKey: '',
    });
    expect(p).toBeInstanceOf(ClaudeProvider);
  });
  it('returns OpenRouterProvider when provider=openrouter with real key', () => {
    const p = createAIProvider({
      provider: 'openrouter',
      anthropicApiKey: '',
      openrouterApiKey: 'sk-or-real',
    });
    expect(p).toBeInstanceOf(OpenRouterProvider);
  });
  it('returns NoOpProvider when openrouter key is placeholder', () => {
    const p = createAIProvider({
      provider: 'openrouter',
      anthropicApiKey: '',
      openrouterApiKey: 'sk-or-your-key-here',
    });
    expect(p).toBeInstanceOf(NoOpProvider);
  });
});

describe('NoOpProvider', () => {
  it('returns null from complete()', async () => {
    const p = new NoOpProvider();
    const result = await p.complete({
      model: 'x',
      systemPrompt: 's',
      userPrompt: 'u',
      maxTokens: 100,
    });
    expect(result).toBeNull();
  });
});

describe('ClaudeProvider.complete', () => {
  it('calls Anthropic SDK and returns text', async () => {
    const p = new ClaudeProvider('sk-ant-api03-real');
    const result = await p.complete({
      model: 'claude-haiku-4-5-20251001',
      systemPrompt: 's',
      userPrompt: 'u',
      maxTokens: 100,
      cache: true,
    });
    expect(result).toBe('hello');
  });
});

describe('OpenRouterProvider.complete', () => {
  it('POSTs to openrouter and returns content', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'howdy' } }] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const p = new OpenRouterProvider('sk-or-real');
    const result = await p.complete({
      model: 'anthropic/claude-haiku',
      systemPrompt: 's',
      userPrompt: 'u',
      maxTokens: 100,
    });
    expect(result).toBe('howdy');
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toContain('openrouter.ai');
    expect(JSON.parse(opts.body as string).model).toBe('anthropic/claude-haiku');
    vi.unstubAllGlobals();
  });
  it('returns null on non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const p = new OpenRouterProvider('sk-or-real');
    const result = await p.complete({
      model: 'x',
      systemPrompt: 's',
      userPrompt: 'u',
      maxTokens: 100,
    });
    expect(result).toBeNull();
    vi.unstubAllGlobals();
  });
});
```

**Step 2: Run test — verify it fails**

Run: `cd apps/server && pnpm test -- ai.test.ts`
Expected: FAIL — module not found.

**Step 3: Implement `services/ai.ts`**

```ts
// apps/server/src/services/ai.ts
import Anthropic from '@anthropic-ai/sdk';

export interface AICompleteOpts {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens: number;
  cache?: boolean;
}

export interface AIProvider {
  complete(opts: AICompleteOpts): Promise<string | null>;
}

const PLACEHOLDER_PREFIXES = ['sk-ant-your-key', 'sk-or-your-key', 'your-'];
function isPlaceholder(key: string): boolean {
  if (!key) return true;
  return PLACEHOLDER_PREFIXES.some(p => key.startsWith(p));
}

export class NoOpProvider implements AIProvider {
  async complete(): Promise<string | null> {
    return null;
  }
}

export class ClaudeProvider implements AIProvider {
  private client: Anthropic;
  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }
  async complete(opts: AICompleteOpts): Promise<string | null> {
    try {
      const res = await this.client.messages.create({
        model: opts.model,
        max_tokens: opts.maxTokens,
        system: opts.cache
          ? [{ type: 'text', text: opts.systemPrompt, cache_control: { type: 'ephemeral' } }]
          : opts.systemPrompt,
        messages: [{ role: 'user', content: opts.userPrompt }],
      });
      const content = res.content[0];
      return content?.type === 'text' ? content.text : null;
    } catch (err) {
      console.error('[SIGNAL] Claude call failed:', err);
      return null;
    }
  }
}

export class OpenRouterProvider implements AIProvider {
  constructor(private apiKey: string) {}
  async complete(opts: AICompleteOpts): Promise<string | null> {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: opts.model,
          max_tokens: opts.maxTokens,
          messages: [
            { role: 'system', content: opts.systemPrompt },
            { role: 'user', content: opts.userPrompt },
          ],
        }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      return data.choices?.[0]?.message?.content ?? null;
    } catch (err) {
      console.error('[SIGNAL] OpenRouter call failed:', err);
      return null;
    }
  }
}

export interface AIConfig {
  provider: 'claude' | 'openrouter';
  anthropicApiKey: string;
  openrouterApiKey: string;
}

export function createAIProvider(config: AIConfig): AIProvider {
  if (config.provider === 'openrouter') {
    if (isPlaceholder(config.openrouterApiKey)) return new NoOpProvider();
    return new OpenRouterProvider(config.openrouterApiKey);
  }
  if (isPlaceholder(config.anthropicApiKey)) return new NoOpProvider();
  return new ClaudeProvider(config.anthropicApiKey);
}
```

**Step 4: Refactor `services/claude.ts`**

Replace the file contents with:

```ts
// apps/server/src/services/claude.ts
import type { SignalFrame } from '@signal/types';
import type { AIProvider } from './ai.js';

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

export interface LiveNudgeOptions {
  ai: AIProvider;
  model: string;
  systemPrompt: string;
  userPrompt: string;
}

export async function runLiveNudge(opts: LiveNudgeOptions): Promise<SignalFrame | null> {
  const text = await opts.ai.complete({
    model: opts.model,
    systemPrompt: opts.systemPrompt,
    userPrompt: opts.userPrompt,
    maxTokens: 300,
    cache: true,
  });
  if (!text) return null;
  return parseSignalFrame(text);
}
```

**Step 5: Update `claude.test.ts` to test the new exports**

```ts
// apps/server/src/services/claude.test.ts
import { describe, it, expect } from 'vitest';
import { parseSignalFrame, runLiveNudge } from './claude.js';
import { NoOpProvider } from './ai.js';

const VALID_FRAME = {
  prompt: {
    type: 'ASK',
    text: 'Ask about timeline',
    confidence: 0.85,
    isNudge: false,
    timestamp: 1234567890,
  },
  bodyLang: { eyeContact: 'direct', posture: 'neutral', microExpressions: 'engaged' },
  sentiment: 72,
  dangerFlag: false,
  dangerReason: null,
};

describe('parseSignalFrame', () => {
  it('parses valid JSON string', () => {
    const result = parseSignalFrame(JSON.stringify(VALID_FRAME));
    expect(result?.prompt.type).toBe('ASK');
    expect(result?.sentiment).toBe(72);
  });
  it('returns null for invalid JSON', () => {
    expect(parseSignalFrame('not json')).toBeNull();
  });
  it('returns null for JSON missing required fields', () => {
    expect(parseSignalFrame('{"prompt": {}}')).toBeNull();
  });
});

describe('runLiveNudge', () => {
  it('returns null when provider returns null', async () => {
    const result = await runLiveNudge({
      ai: new NoOpProvider(),
      model: 'claude-haiku-4-5-20251001',
      systemPrompt: 's',
      userPrompt: 'u',
    });
    expect(result).toBeNull();
  });
  it('returns parsed frame when provider returns JSON', async () => {
    const ai = { complete: async () => JSON.stringify(VALID_FRAME) };
    const result = await runLiveNudge({ ai, model: 'x', systemPrompt: 's', userPrompt: 'u' });
    expect(result?.prompt.type).toBe('ASK');
  });
});
```

**Step 6: Run tests**

Run: `cd apps/server && pnpm test -- ai.test.ts claude.test.ts`
Expected: PASS.

**Step 7: Commit**

```bash
git add apps/server/src/services/ai.ts apps/server/src/services/ai.test.ts apps/server/src/services/claude.ts apps/server/src/services/claude.test.ts
git commit -m "feat(server): AIProvider abstraction (Claude + OpenRouter)"
```

---

## Task 5: OctaMem service — `services/octamem.ts`

**Files:**

- Create: `apps/server/src/services/octamem.ts`
- Create: `apps/server/src/services/octamem.test.ts`

**Note on API shape:** OctaMem is a natural-language memory store. The assumed REST shape (based on the MCP tool contract — `octamem_add(content, previousContext?)` and `octamem_query(query, previousContext?)`) is:

- `POST {BASE}/v1/add` — `{ content: string, previousContext?: string }` → `{ id: string }`
- `POST {BASE}/v1/query` — `{ query: string, previousContext?: string }` → `{ result: string }`
- Auth: `Authorization: Bearer {OCTAMEM_API_KEY}`
- Base URL defaults to `https://api.octamem.com`, configurable via `OCTAMEM_BASE_URL` env. If the real shape differs, adjust URLs/body keys in one file.

**Step 1: Write the failing test**

```ts
// apps/server/src/services/octamem.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { queryProspectContext, storeCallMemory } from './octamem.js';

describe('octamem', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it('queryProspectContext returns null when key is placeholder', async () => {
    const res = await queryProspectContext({
      apiKey: 'your-octamem-key-here',
      prospect: { name: 'J' },
    });
    expect(res).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('queryProspectContext returns result string on success', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ result: 'Last spoke 2026-03-10' }),
    });
    const res = await queryProspectContext({
      apiKey: 'real-key',
      prospect: { name: 'James', company: 'Acme' },
    });
    expect(res).toBe('Last spoke 2026-03-10');
  });

  it('queryProspectContext returns null on fetch failure', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('net'));
    const res = await queryProspectContext({ apiKey: 'real-key', prospect: { name: 'J' } });
    expect(res).toBeNull();
  });

  it('storeCallMemory returns null when key is placeholder', async () => {
    const res = await storeCallMemory({
      apiKey: 'your-octamem-key-here',
      contact: { name: 'J' },
      callType: 'investor',
      durationMs: 0,
      sentimentAvg: 0,
      summary: { winSignals: [], objections: [], decisions: [], followUpDraft: '' },
      dangerMoments: [],
    });
    expect(res).toBeNull();
  });

  it('storeCallMemory posts formatted memory and returns id', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'mem_123' }),
    });
    const res = await storeCallMemory({
      apiKey: 'real-key',
      contact: { name: 'James', company: 'Acme', role: 'CEO' },
      callType: 'investor',
      durationMs: 1800000,
      sentimentAvg: 72,
      summary: {
        winSignals: ['Asked about timing'],
        objections: ['Burn rate'],
        decisions: ['Send deck'],
        followUpDraft: 'James, great...',
      },
      dangerMoments: [{ reason: 'pricing objection', timestamp: 1700000000000 }],
      previousOctamemId: 'mem_prev',
    });
    expect(res).toBe('mem_123');
    const body = JSON.parse(
      (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].body as string,
    );
    expect(body.content).toContain('James');
    expect(body.content).toContain('investor');
    expect(body.previousContext).toBe('mem_prev');
  });
});
```

**Step 2: Run — verify fail**

Run: `cd apps/server && pnpm test -- octamem.test.ts`
Expected: FAIL — module not found.

**Step 3: Implement `services/octamem.ts`**

```ts
// apps/server/src/services/octamem.ts
import type { CallType, PostCallSummary } from '@signal/types';

const DEFAULT_BASE = 'https://api.octamem.com';
const PLACEHOLDER_PREFIXES = ['your-octamem', 'your-'];
function isPlaceholder(key: string): boolean {
  if (!key) return true;
  return PLACEHOLDER_PREFIXES.some(p => key.startsWith(p));
}

function baseUrl(): string {
  return process.env.OCTAMEM_BASE_URL ?? DEFAULT_BASE;
}

export interface QueryOpts {
  apiKey: string;
  prospect: { name: string; company?: string };
  previousOctamemId?: string;
}

export async function queryProspectContext(opts: QueryOpts): Promise<string | null> {
  if (isPlaceholder(opts.apiKey)) return null;
  const query = `${opts.prospect.name}${opts.prospect.company ? ' at ' + opts.prospect.company : ''} — what do we know?`;
  try {
    const res = await fetch(`${baseUrl()}/v1/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${opts.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, previousContext: opts.previousOctamemId }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { result?: string };
    return data.result ?? null;
  } catch (err) {
    console.error('[SIGNAL] OctaMem query failed:', err);
    return null;
  }
}

export interface StoreOpts {
  apiKey: string;
  contact: { name: string; company?: string; role?: string };
  callType: CallType;
  durationMs: number;
  sentimentAvg: number;
  summary: PostCallSummary;
  dangerMoments: Array<{ reason: string; timestamp: number }>;
  previousOctamemId?: string;
}

function formatMemory(o: StoreOpts): string {
  const { contact, callType, durationMs, sentimentAvg, summary, dangerMoments } = o;
  const date = new Date().toISOString().slice(0, 10);
  const mins = Math.round(durationMs / 60000);
  const header = `Call: ${contact.name}${contact.role ? ` (${contact.role}` : ''}${contact.company ? `, ${contact.company}` : ''}${contact.role ? ')' : ''} — ${date}, ${mins} min, ${callType}`;
  const lines = [
    header,
    `Sentiment: ${Math.round(sentimentAvg)}/100`,
    '',
    `Win signals: ${summary.winSignals.join('; ') || '(none)'}`,
    `Objections: ${summary.objections.join('; ') || '(none)'}`,
    `Decisions: ${summary.decisions.join('; ') || '(none)'}`,
    `Follow-up: "${summary.followUpDraft}"`,
  ];
  if (dangerMoments.length > 0) {
    lines.push(
      '',
      `Danger moments: ${dangerMoments.map(d => `${d.reason}@${d.timestamp}`).join('; ')}`,
    );
  }
  return lines.join('\n');
}

export async function storeCallMemory(opts: StoreOpts): Promise<string | null> {
  if (isPlaceholder(opts.apiKey)) return null;
  try {
    const res = await fetch(`${baseUrl()}/v1/add`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${opts.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: formatMemory(opts),
        previousContext: opts.previousOctamemId,
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { id?: string };
    return data.id ?? null;
  } catch (err) {
    console.error('[SIGNAL] OctaMem store failed:', err);
    return null;
  }
}
```

**Step 4: Run — verify pass**

Run: `cd apps/server && pnpm test -- octamem.test.ts`
Expected: PASS (5/5).

**Step 5: Commit**

```bash
git add apps/server/src/services/octamem.ts apps/server/src/services/octamem.test.ts
git commit -m "feat(server): OctaMem query + store service"
```

---

## Task 6: Summary service — `services/summary.ts`

**Files:**

- Create: `apps/server/src/services/summary.ts`
- Create: `apps/server/src/services/summary.test.ts`

**Step 1: Failing test**

```ts
// apps/server/src/services/summary.test.ts
import { describe, it, expect } from 'vitest';
import { generateSummary } from './summary.js';

const VALID_JSON = JSON.stringify({
  winSignals: ['Asked about Series A'],
  objections: ['Burn rate'],
  decisions: ['Send deck'],
  followUpDraft: 'James, great speaking today...',
});

describe('generateSummary', () => {
  it('returns null when provider returns null', async () => {
    const ai = { complete: async () => null };
    const res = await generateSummary({ ai, model: 'x', callType: 'investor', transcript: [] });
    expect(res).toBeNull();
  });
  it('parses valid JSON into PostCallSummary', async () => {
    const ai = { complete: async () => VALID_JSON };
    const res = await generateSummary({
      ai,
      model: 'claude-sonnet-4-6',
      callType: 'investor',
      transcript: [{ speaker: 'user', text: 'Hello', timestamp: 1 }],
    });
    expect(res?.winSignals).toEqual(['Asked about Series A']);
    expect(res?.followUpDraft).toContain('James');
  });
  it('returns null on malformed JSON', async () => {
    const ai = { complete: async () => 'not json' };
    const res = await generateSummary({ ai, model: 'x', callType: 'enterprise', transcript: [] });
    expect(res).toBeNull();
  });
  it('returns null when JSON is missing fields', async () => {
    const ai = { complete: async () => '{"winSignals":["x"]}' };
    const res = await generateSummary({ ai, model: 'x', callType: 'enterprise', transcript: [] });
    expect(res).toBeNull();
  });
});
```

**Step 2: Run — verify fail**

Run: `cd apps/server && pnpm test -- summary.test.ts`
Expected: FAIL.

**Step 3: Implement `services/summary.ts`**

```ts
// apps/server/src/services/summary.ts
import type { CallType, PostCallSummary, TranscriptLine } from '@signal/types';
import type { AIProvider } from './ai.js';

export interface GenerateSummaryOpts {
  ai: AIProvider;
  model: string;
  callType: CallType;
  transcript: TranscriptLine[];
}

const SYSTEM_PROMPT = `You are SIGNAL's post-call analyst. Given a full call transcript, produce a crisp JSON summary.

Return ONLY valid JSON matching this exact shape — no markdown, no prose:
{
  "winSignals":     string[],   // concrete buyer-intent moments
  "objections":     string[],   // explicit concerns raised
  "decisions":      string[],   // next steps either side committed to
  "followUpDraft":  string      // 2-4 sentence follow-up email draft, first-person
}

Rules:
- Each array item is a short phrase (≤ 100 chars).
- followUpDraft is ready to send as-is.
- Return empty arrays if the category is genuinely absent (do NOT invent).`;

function buildUserPrompt(callType: CallType, transcript: TranscriptLine[]): string {
  const lines = transcript.map(l => `[${l.speaker.toUpperCase()}] ${l.text}`).join('\n');
  return `Call type: ${callType}\n\nTranscript:\n${lines}\n\nReturn the PostCallSummary JSON now.`;
}

function parseSummary(text: string): PostCallSummary | null {
  try {
    const obj = JSON.parse(text) as Partial<PostCallSummary>;
    if (
      !Array.isArray(obj.winSignals) ||
      !Array.isArray(obj.objections) ||
      !Array.isArray(obj.decisions) ||
      typeof obj.followUpDraft !== 'string'
    )
      return null;
    return obj as PostCallSummary;
  } catch {
    return null;
  }
}

export async function generateSummary(opts: GenerateSummaryOpts): Promise<PostCallSummary | null> {
  const text = await opts.ai.complete({
    model: opts.model,
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: buildUserPrompt(opts.callType, opts.transcript),
    maxTokens: 600,
    cache: false,
  });
  if (!text) return null;
  return parseSummary(text);
}
```

**Step 4: Run — verify pass**

Run: `cd apps/server && pnpm test -- summary.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/server/src/services/summary.ts apps/server/src/services/summary.test.ts
git commit -m "feat(server): post-call summary generation service"
```

---

## Task 7: Update `prompts/live.ts` — inject OctaMem context

**Files:**

- Modify: `apps/server/src/prompts/live.ts`

**Step 1: Update `buildSystemPrompt` signature**

Replace the function in `apps/server/src/prompts/live.ts`:

```ts
export function buildSystemPrompt(callType: CallType, octaMemContext?: string | null): string {
  const priorContext = octaMemContext
    ? `\n## Prior Context on This Prospect\n${octaMemContext}\n`
    : '';
  return `You are SIGNAL, a real-time AI co-pilot for ${callType} calls. You receive a rolling transcript and return structured coaching JSON.

## Company Context
${COMPANY_CONTEXT}
${priorContext}
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
```

**Step 2: Typecheck**

Run: `cd apps/server && pnpm typecheck`
Expected: PASS (optional param is backward compatible).

**Step 3: Commit**

```bash
git add apps/server/src/prompts/live.ts
git commit -m "feat(server): inject OctaMem prior-context into system prompt"
```

---

## Task 8: Update `routes/ws.ts` — prospect, persistence, summary on stop

**Files:**

- Modify: `apps/server/src/routes/ws.ts`
- Modify: `apps/server/src/routes/ws.test.ts`

**Step 1: Rewrite `ws.ts`**

```ts
// apps/server/src/routes/ws.ts
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { CallSession } from '../services/session.js';
import { createDeepgramClient } from '../services/deepgram.js';
import { runLiveNudge } from '../services/claude.js';
import { buildSystemPrompt, buildUserPrompt } from '../prompts/live.js';
import { generateSummary } from '../services/summary.js';
import { queryProspectContext, storeCallMemory } from '../services/octamem.js';
import {
  contacts,
  callSessions,
  transcriptLines,
  signalFrames,
  callSummaries,
  type DB,
} from '../services/db.js';
import type { AIProvider } from '../services/ai.js';
import type {
  ClientMessage,
  ServerMessage,
  Prospect,
  SignalFrame,
  TranscriptLine,
} from '@signal/types';

const CLAUDE_INTERVAL_MS = 12_000;
const MIN_NEW_LINES = 2;

export interface WsRouteOptions {
  db: DB;
  ai: AIProvider;
  deepgramApiKey: string;
  octamemApiKey: string;
  liveModel: string;
  summaryModel: string;
}

export function registerWsRoute(app: FastifyInstance, opts: WsRouteOptions): void {
  app.get('/ws', { websocket: true }, socket => {
    // Per-connection state
    let session: CallSession | null = null;
    let sessionId = randomUUID();
    let contactId: string | null = null;
    let prospect: Prospect | null = null;
    let octamemContext: string | null = null;
    let previousOctamemId: string | null = null;
    let callType: ClientMessage extends { callType: infer C } ? C : never;
    let platform: 'meet' | 'zoom' | 'teams' = 'meet';
    let startedAt = Date.now();
    let systemPrompt = '';
    let claudeTimer: NodeJS.Timeout | null = null;
    let sentimentSum = 0;
    let sentimentCount = 0;
    const dangerMoments: Array<{ reason: string; timestamp: number }> = [];
    const collectedTranscript: TranscriptLine[] = [];
    let ended = false;

    function send(msg: ServerMessage): void {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(msg));
    }

    setImmediate(() => send({ type: 'connected', sessionId }));

    const dg = createDeepgramClient({
      apiKey: opts.deepgramApiKey,
      onTranscript: line => {
        if (!session) return;
        session.addLine(line);
        collectedTranscript.push(line);
        opts.db
          .insert(transcriptLines)
          .values({
            sessionId,
            speaker: line.speaker,
            text: line.text,
            timestamp: line.timestamp,
          })
          .run();
        send({ type: 'transcript', line });
        const danger = session.detectKeyword(line.text);
        if (danger) {
          dangerMoments.push({ reason: danger, timestamp: line.timestamp });
          send({ type: 'state', overlayState: 'DANGER' });
        }
      },
      onError: err => {
        console.error('[SIGNAL] Deepgram error:', err);
        send({ type: 'error', message: 'STT error' });
      },
    });

    async function onStart(msg: Extract<ClientMessage, { type: 'start' }>): Promise<void> {
      platform = msg.platform;
      callType = msg.callType;
      prospect = msg.prospect;
      startedAt = Date.now();
      session = new CallSession(platform, callType);

      // Upsert contact
      contactId = await upsertContact(opts.db, prospect);

      // Fetch prior OctaMem id from contact row (if any)
      const row = opts.db.select().from(contacts).where(eq(contacts.id, contactId)).get();
      previousOctamemId = row?.octamemId ?? null;

      // Create call_session row
      opts.db
        .insert(callSessions)
        .values({
          id: sessionId,
          contactId,
          platform,
          callType,
          startedAt,
        })
        .run();

      // Query OctaMem for prior context (non-blocking for send)
      octamemContext = await queryProspectContext({
        apiKey: opts.octamemApiKey,
        prospect: { name: prospect.name, company: prospect.company },
        previousOctamemId: previousOctamemId ?? undefined,
      });

      systemPrompt = buildSystemPrompt(callType, octamemContext);
      send({ type: 'state', overlayState: 'LIVE' });

      claudeTimer = setInterval(async () => {
        if (!session) return;
        if (session.newLinesSinceLastCall < MIN_NEW_LINES) return;
        const window = session.getWindow();
        session.resetNewLines();
        if (session.isSilent()) send({ type: 'state', overlayState: 'DANGER' });
        const frame = await runLiveNudge({
          ai: opts.ai,
          model: opts.liveModel,
          systemPrompt,
          userPrompt: buildUserPrompt(window),
        });
        if (frame) {
          persistFrame(opts.db, sessionId, frame);
          sentimentSum += frame.sentiment;
          sentimentCount += 1;
          send({ type: 'frame', frame });
          send({ type: 'state', overlayState: frame.dangerFlag ? 'DANGER' : 'LIVE' });
        }
      }, CLAUDE_INTERVAL_MS);
    }

    async function onStop(): Promise<void> {
      if (ended) return;
      ended = true;
      if (claudeTimer) {
        clearInterval(claudeTimer);
        claudeTimer = null;
      }
      dg.finish();

      const endedAt = Date.now();
      const durationMs = endedAt - startedAt;
      const sentimentAvg = sentimentCount > 0 ? sentimentSum / sentimentCount : 0;

      opts.db
        .update(callSessions)
        .set({
          endedAt,
          durationMs,
          sentimentAvg,
        })
        .where(eq(callSessions.id, sessionId))
        .run();

      if (!session || !prospect || !contactId) return;

      const summary = await generateSummary({
        ai: opts.ai,
        model: opts.summaryModel,
        callType,
        transcript: collectedTranscript,
      });

      if (summary) {
        opts.db
          .insert(callSummaries)
          .values({
            id: randomUUID(),
            sessionId,
            winSignals: JSON.stringify(summary.winSignals),
            objections: JSON.stringify(summary.objections),
            decisions: JSON.stringify(summary.decisions),
            followUpDraft: summary.followUpDraft,
            createdAt: endedAt,
          })
          .run();

        const newMemId = await storeCallMemory({
          apiKey: opts.octamemApiKey,
          contact: { name: prospect.name, company: prospect.company, role: undefined },
          callType,
          durationMs,
          sentimentAvg,
          summary,
          dangerMoments,
          previousOctamemId: previousOctamemId ?? undefined,
        });
        if (newMemId) {
          opts.db
            .update(contacts)
            .set({ octamemId: newMemId, updatedAt: endedAt })
            .where(eq(contacts.id, contactId))
            .run();
        }

        send({ type: 'summary', summary });
        send({ type: 'state', overlayState: 'POSTCALL' });
      }
    }

    socket.on('message', rawData => {
      const data = Buffer.isBuffer(rawData) ? rawData : Buffer.from(rawData as ArrayBuffer);
      try {
        const msg = JSON.parse(data.toString()) as ClientMessage;
        if (msg.type === 'start') {
          void onStart(msg);
          return;
        }
        if (msg.type === 'stop') {
          void onStop();
          return;
        }
      } catch {
        dg.send(data);
      }
    });

    socket.on('close', () => {
      void onStop();
    });
    socket.on('error', err => {
      console.error('[SIGNAL] WS socket error:', err);
      void onStop();
    });
  });
}

async function upsertContact(db: DB, prospect: Prospect): Promise<string> {
  const now = Date.now();
  const existing = db
    .select()
    .from(contacts)
    .where(
      and(
        eq(contacts.name, prospect.name),
        prospect.company
          ? eq(contacts.company, prospect.company)
          : eq(contacts.name, prospect.name),
      ),
    )
    .get();
  if (existing) {
    db.update(contacts)
      .set({
        email: prospect.email ?? existing.email,
        linkedinUrl: prospect.linkedinUrl ?? existing.linkedinUrl,
        company: prospect.company ?? existing.company,
        updatedAt: now,
      })
      .where(eq(contacts.id, existing.id))
      .run();
    return existing.id;
  }
  const id = randomUUID();
  db.insert(contacts)
    .values({
      id,
      name: prospect.name,
      email: prospect.email,
      linkedinUrl: prospect.linkedinUrl,
      company: prospect.company,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return id;
}

function persistFrame(db: DB, sessionId: string, frame: SignalFrame): void {
  db.insert(signalFrames)
    .values({
      sessionId,
      promptType: frame.prompt.type,
      promptText: frame.prompt.text,
      confidence: frame.prompt.confidence,
      sentiment: frame.sentiment,
      dangerFlag: frame.dangerFlag ? 1 : 0,
      createdAt: Date.now(),
    })
    .run();
}
```

**Step 2: Update `ws.test.ts`**

Replace the mock block + buildApp:

```ts
// apps/server/src/routes/ws.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import websocketPlugin from '@fastify/websocket';
import WebSocket from 'ws';

vi.mock('../services/deepgram.js', () => ({
  createDeepgramClient: vi.fn(() => ({ send: vi.fn(), finish: vi.fn() })),
}));
vi.mock('../services/octamem.js', () => ({
  queryProspectContext: vi.fn().mockResolvedValue(null),
  storeCallMemory: vi.fn().mockResolvedValue(null),
}));
vi.mock('../services/summary.js', () => ({
  generateSummary: vi.fn().mockResolvedValue(null),
}));

import { registerWsRoute } from './ws.js';
import { initDb } from '../services/db.js';
import { NoOpProvider } from '../services/ai.js';

async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(websocketPlugin);
  registerWsRoute(app, {
    db: initDb(':memory:'),
    ai: new NoOpProvider(),
    deepgramApiKey: 'your-deepgram-key-here',
    octamemApiKey: 'your-octamem-key-here',
    liveModel: 'claude-haiku-4-5-20251001',
    summaryModel: 'claude-sonnet-4-6',
  });
  await app.ready();
  return app;
}

function connectAndDrainConnected(address: string): Promise<WebSocket> {
  return new Promise(resolve => {
    const ws = new WebSocket(address);
    ws.once('message', () => resolve(ws));
  });
}

describe('WebSocket route', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let address: string;

  beforeEach(async () => {
    app = await buildApp();
    const listen = await app.listen({ port: 0 });
    address = `ws://localhost:${new URL(listen).port}/ws`;
  });
  afterEach(async () => {
    await app.close();
  });

  it('sends connected message on connect', async () => {
    const ws = new WebSocket(address);
    const msg = await new Promise<string>(resolve => {
      ws.on('message', d => resolve(d.toString()));
    });
    ws.close();
    expect(JSON.parse(msg).type).toBe('connected');
  });

  it('handles start with prospect + stop', async () => {
    const ws = await connectAndDrainConnected(address);
    ws.send(
      JSON.stringify({
        type: 'start',
        platform: 'meet',
        callType: 'investor',
        prospect: { name: 'James', company: 'Acme' },
      }),
    );
    await new Promise(r => setTimeout(r, 100));
    ws.send(JSON.stringify({ type: 'stop' }));
    await new Promise(r => setTimeout(r, 50));
    expect(ws.readyState).toBe(WebSocket.OPEN);
    ws.close();
  });

  it('handles binary audio chunk', async () => {
    const ws = await connectAndDrainConnected(address);
    ws.send(Buffer.from([0x01, 0x02, 0x03]));
    await new Promise(r => setTimeout(r, 50));
    expect(ws.readyState).toBe(WebSocket.OPEN);
    ws.close();
  });
});
```

**Step 3: Run**

Run: `cd apps/server && pnpm test -- ws.test.ts`
Expected: PASS (3/3).

**Step 4: Commit**

```bash
git add apps/server/src/routes/ws.ts apps/server/src/routes/ws.test.ts
git commit -m "feat(server): persist calls, generate summary, push OctaMem on stop"
```

---

## Task 9: REST API — `routes/api.ts`

**Files:**

- Create: `apps/server/src/routes/api.ts`
- Create: `apps/server/src/routes/api.test.ts`

**Step 1: Failing test**

```ts
// apps/server/src/routes/api.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { registerApiRoutes } from './api.js';
import { initDb, contacts, callSessions } from '../services/db.js';

async function buildApp() {
  const app = Fastify({ logger: false });
  const db = initDb(':memory:');
  registerApiRoutes(app, { db });
  await app.ready();
  return { app, db };
}

describe('REST API', () => {
  it('GET /api/contacts empty', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/contacts' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
    await app.close();
  });

  it('POST /api/contacts creates a contact', async () => {
    const { app } = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/contacts',
      payload: { name: 'James', company: 'Acme' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.id).toBeDefined();
    expect(body.name).toBe('James');
    await app.close();
  });

  it('GET /api/contacts/:id returns 404 for unknown', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/contacts/missing' });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('GET /api/calls returns empty when no sessions', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/calls' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
    await app.close();
  });

  it('PUT /api/contacts/:id updates a contact', async () => {
    const { app, db } = await buildApp();
    const now = Date.now();
    db.insert(contacts).values({ id: 'c1', name: 'James', createdAt: now, updatedAt: now }).run();
    const res = await app.inject({
      method: 'PUT',
      url: '/api/contacts/c1',
      payload: { company: 'Acme Updated', notes: 'Great contact' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().company).toBe('Acme Updated');
    await app.close();
  });

  it('GET /api/analytics/sentiment returns empty array when no calls', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/analytics/sentiment' });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json())).toBe(true);
    await app.close();
  });
});
```

**Step 2: Run — verify fail**

Run: `cd apps/server && pnpm test -- api.test.ts`
Expected: FAIL.

**Step 3: Implement `routes/api.ts`**

```ts
// apps/server/src/routes/api.ts
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { desc, eq, sql } from 'drizzle-orm';
import {
  contacts,
  callSessions,
  transcriptLines,
  signalFrames,
  callSummaries,
  type DB,
} from '../services/db.js';

export interface ApiRouteOptions {
  db: DB;
}

export function registerApiRoutes(app: FastifyInstance, opts: ApiRouteOptions): void {
  const { db } = opts;

  // Contacts
  app.get('/api/contacts', async () => db.select().from(contacts).all());

  app.post('/api/contacts', async (req, reply) => {
    const body = req.body as Partial<typeof contacts.$inferInsert>;
    if (!body.name) return reply.code(400).send({ error: 'name required' });
    const now = Date.now();
    const id = randomUUID();
    const row = {
      id,
      name: body.name,
      email: body.email,
      linkedinUrl: body.linkedinUrl,
      company: body.company,
      role: body.role,
      notes: body.notes,
      createdAt: now,
      updatedAt: now,
    };
    db.insert(contacts).values(row).run();
    return reply.code(201).send(row);
  });

  app.get('/api/contacts/:id', async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const row = db.select().from(contacts).where(eq(contacts.id, id)).get();
    if (!row) return reply.code(404).send({ error: 'not found' });
    return row;
  });

  app.put('/api/contacts/:id', async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const existing = db.select().from(contacts).where(eq(contacts.id, id)).get();
    if (!existing) return reply.code(404).send({ error: 'not found' });
    const body = req.body as Partial<typeof contacts.$inferInsert>;
    const patch = { ...existing, ...body, id, updatedAt: Date.now() };
    db.update(contacts).set(patch).where(eq(contacts.id, id)).run();
    return patch;
  });

  app.delete('/api/contacts/:id', async (req, reply) => {
    const id = (req.params as { id: string }).id;
    db.delete(contacts).where(eq(contacts.id, id)).run();
    return reply.code(204).send();
  });

  // Calls
  app.get('/api/calls', async () =>
    db.select().from(callSessions).orderBy(desc(callSessions.startedAt)).all(),
  );

  app.get('/api/calls/:id', async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const row = db.select().from(callSessions).where(eq(callSessions.id, id)).get();
    if (!row) return reply.code(404).send({ error: 'not found' });
    return row;
  });

  app.get('/api/calls/:id/transcript', async req => {
    const id = (req.params as { id: string }).id;
    return db.select().from(transcriptLines).where(eq(transcriptLines.sessionId, id)).all();
  });

  app.get('/api/calls/:id/frames', async req => {
    const id = (req.params as { id: string }).id;
    return db.select().from(signalFrames).where(eq(signalFrames.sessionId, id)).all();
  });

  app.get('/api/calls/:id/summary', async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const row = db.select().from(callSummaries).where(eq(callSummaries.sessionId, id)).get();
    if (!row) return reply.code(404).send({ error: 'not found' });
    return {
      ...row,
      winSignals: JSON.parse(row.winSignals),
      objections: JSON.parse(row.objections),
      decisions: JSON.parse(row.decisions),
    };
  });

  // Analytics
  app.get('/api/analytics/sentiment', async () => {
    const rows = db
      .select({
        week: sql<string>`strftime('%Y-%W', started_at / 1000, 'unixepoch')`,
        avg: sql<number>`AVG(sentiment_avg)`,
        count: sql<number>`COUNT(*)`,
      })
      .from(callSessions)
      .where(sql`sentiment_avg IS NOT NULL`)
      .groupBy(sql`strftime('%Y-%W', started_at / 1000, 'unixepoch')`)
      .all();
    return rows;
  });

  app.get('/api/analytics/prompt-types', async () => {
    return db
      .select({
        promptType: signalFrames.promptType,
        count: sql<number>`COUNT(*)`,
      })
      .from(signalFrames)
      .groupBy(signalFrames.promptType)
      .all();
  });

  app.get('/api/analytics/objections', async () => {
    const rows = db.select().from(callSummaries).all();
    const counts = new Map<string, number>();
    for (const r of rows) {
      const list = JSON.parse(r.objections) as string[];
      for (const o of list) counts.set(o, (counts.get(o) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([objection, count]) => ({ objection, count }))
      .sort((a, b) => b.count - a.count);
  });
}
```

**Step 4: Run — verify pass**

Run: `cd apps/server && pnpm test -- api.test.ts`
Expected: PASS (6/6).

**Step 5: Commit**

```bash
git add apps/server/src/routes/api.ts apps/server/src/routes/api.test.ts
git commit -m "feat(server): REST API for contacts, calls, analytics"
```

---

## Task 10: Update `index.ts` — DB init, static serving, env validation, API route

**Files:**

- Modify: `apps/server/src/index.ts`
- Create: `apps/server/.env.example`

**Step 1: Rewrite `index.ts`**

```ts
// apps/server/src/index.ts
import Fastify from 'fastify';
import websocketPlugin from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { registerWsRoute } from './routes/ws.js';
import { registerApiRoutes } from './routes/api.js';
import { initDb } from './services/db.js';
import { createAIProvider } from './services/ai.js';

const PORT = Number(process.env.PORT ?? 8080);
const AI_PROVIDER = (process.env.AI_PROVIDER ?? 'claude') as 'claude' | 'openrouter';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? 'sk-ant-your-key-here';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY ?? 'sk-or-your-key-here';
const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY ?? 'your-deepgram-key-here';
const OCTAMEM_API_KEY = process.env.OCTAMEM_API_KEY ?? 'your-octamem-key-here';
const DATABASE_URL = process.env.DATABASE_URL ?? './signal.db';
const LIVE_MODEL = process.env.LIVE_MODEL ?? 'claude-haiku-4-5-20251001';
const SUMMARY_MODEL = process.env.SUMMARY_MODEL ?? 'claude-sonnet-4-6';

const app = Fastify({
  logger: { transport: { target: 'pino-pretty', options: { colorize: true } } },
});

const db = initDb(DATABASE_URL);
const ai = createAIProvider({
  provider: AI_PROVIDER,
  anthropicApiKey: ANTHROPIC_API_KEY,
  openrouterApiKey: OPENROUTER_API_KEY,
});

await app.register(websocketPlugin);

// Dashboard static files (built by `pnpm --filter server run build:dashboard` → apps/server/public)
const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');
await app.register(fastifyStatic, { root: publicDir, prefix: '/dashboard/' });

app.get('/health', async () => ({ ok: true, ts: Date.now() }));

registerWsRoute(app, {
  db,
  ai,
  deepgramApiKey: DEEPGRAM_API_KEY,
  octamemApiKey: OCTAMEM_API_KEY,
  liveModel: LIVE_MODEL,
  summaryModel: SUMMARY_MODEL,
});
registerApiRoutes(app, { db });

try {
  await app.listen({ port: PORT, host: '0.0.0.0' });
  app.log.info(`[SIGNAL] AI provider: ${AI_PROVIDER}, DB: ${DATABASE_URL}`);
  if (AI_PROVIDER === 'claude' && ANTHROPIC_API_KEY.startsWith('sk-ant-your-key')) {
    app.log.warn('[SIGNAL] ANTHROPIC_API_KEY is placeholder — AI disabled');
  }
  if (AI_PROVIDER === 'openrouter' && OPENROUTER_API_KEY.startsWith('sk-or-your-key')) {
    app.log.warn('[SIGNAL] OPENROUTER_API_KEY is placeholder — AI disabled');
  }
  if (DEEPGRAM_API_KEY.startsWith('your-deepgram'))
    app.log.warn('[SIGNAL] DEEPGRAM_API_KEY is placeholder — STT disabled');
  if (OCTAMEM_API_KEY.startsWith('your-octamem'))
    app.log.warn('[SIGNAL] OCTAMEM_API_KEY is placeholder — memory disabled');
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
```

**Step 2: Create `.env.example`**

```
# AI provider — 'claude' or 'openrouter'
AI_PROVIDER=claude

# Claude direct
ANTHROPIC_API_KEY=sk-ant-your-key-here

# OpenRouter alternative (OpenAI-compatible)
OPENROUTER_API_KEY=sk-or-your-key-here

# Model overrides
LIVE_MODEL=claude-haiku-4-5-20251001
SUMMARY_MODEL=claude-sonnet-4-6

# Deepgram STT
DEEPGRAM_API_KEY=your-deepgram-key-here

# OctaMem semantic memory
OCTAMEM_API_KEY=your-octamem-key-here
# OCTAMEM_BASE_URL=https://api.octamem.com

# SQLite path (Fly prod: /data/signal.db; dev: ./signal.db)
DATABASE_URL=./signal.db

PORT=8080
NODE_ENV=development
```

**Step 3: Make `public/` directory exist so static plugin doesn't crash on first run**

Run: `mkdir -p apps/server/public && touch apps/server/public/.gitkeep`

**Step 4: Start server to verify**

Run: `cd apps/server && pnpm dev`
Expected: server listens on :8080, logs warnings for placeholder keys, `GET /health` returns `{ ok: true }`.

Verify with: `curl -s http://localhost:8080/health` and `curl -s http://localhost:8080/api/contacts` → `[]`.

Kill server.

**Step 5: Commit**

```bash
git add apps/server/src/index.ts apps/server/.env.example apps/server/public/.gitkeep
git commit -m "feat(server): wire DB, AI provider, static dashboard, API routes into bootstrap"
```

---

## Task 11: Dashboard — Vite + React SPA

**Files:**

- Create: `apps/server/dashboard/package.json`
- Create: `apps/server/dashboard/vite.config.ts`
- Create: `apps/server/dashboard/tsconfig.json`
- Create: `apps/server/dashboard/index.html`
- Create: `apps/server/dashboard/src/main.tsx`
- Create: `apps/server/dashboard/src/App.tsx`
- Create: `apps/server/dashboard/src/lib/api.ts`
- Create: `apps/server/dashboard/src/pages/Home.tsx`
- Create: `apps/server/dashboard/src/pages/Contacts.tsx`
- Create: `apps/server/dashboard/src/pages/ContactDetail.tsx`
- Create: `apps/server/dashboard/src/pages/CallDetail.tsx`
- Create: `apps/server/dashboard/src/styles.css`
- Modify: `apps/server/package.json` — add `build:dashboard`, chain into `build`
- Modify: `turbo.json` — ensure dashboard build output is cached

**Step 1: `dashboard/package.json`**

```json
{
  "name": "dashboard",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "react-router-dom": "^6.26.0",
    "@tanstack/react-query": "^5.51.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "typescript": "^5.5.0",
    "vite": "^5.4.0"
  }
}
```

**Step 2: Install**

Run: `cd apps/server/dashboard && pnpm install`

**Step 3: `vite.config.ts`**

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/dashboard/',
  build: { outDir: '../public', emptyOutDir: true },
  server: { port: 5173, proxy: { '/api': 'http://localhost:8080' } },
});
```

**Step 4: `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "baseUrl": ".",
    "paths": { "@signal/types": ["../../../packages/types/index.ts"] }
  },
  "include": ["src"]
}
```

**Step 5: `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>SIGNAL Dashboard</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

**Step 6: `src/main.tsx`**

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './styles.css';

const qc = new QueryClient();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <BrowserRouter basename="/dashboard">
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
```

**Step 7: `src/App.tsx`**

```tsx
import { Routes, Route, NavLink } from 'react-router-dom';
import Home from './pages/Home';
import Contacts from './pages/Contacts';
import ContactDetail from './pages/ContactDetail';
import CallDetail from './pages/CallDetail';

export default function App() {
  return (
    <div className="app">
      <nav className="sidebar">
        <h1>SIGNAL</h1>
        <NavLink to="/" end>
          Home
        </NavLink>
        <NavLink to="/contacts">Contacts</NavLink>
      </nav>
      <main className="content">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/contacts" element={<Contacts />} />
          <Route path="/contacts/:id" element={<ContactDetail />} />
          <Route path="/calls/:id" element={<CallDetail />} />
        </Routes>
      </main>
    </div>
  );
}
```

**Step 8: `src/lib/api.ts`**

```ts
const BASE = '/api';

export interface Contact {
  id: string;
  name: string;
  email?: string;
  linkedinUrl?: string;
  company?: string;
  role?: string;
  notes?: string;
  octamemId?: string;
  createdAt: number;
  updatedAt: number;
}
export interface CallSession {
  id: string;
  contactId: string | null;
  platform: string;
  callType: string;
  startedAt: number;
  endedAt: number | null;
  durationMs: number | null;
  sentimentAvg: number | null;
}
export interface TranscriptLine {
  id: number;
  speaker: string;
  text: string;
  timestamp: number;
}
export interface SignalFrameRow {
  id: number;
  promptType: string;
  promptText: string;
  confidence: number;
  sentiment: number;
  dangerFlag: number;
  createdAt: number;
}
export interface CallSummaryRow {
  winSignals: string[];
  objections: string[];
  decisions: string[];
  followUpDraft: string;
  createdAt: number;
}

async function j<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, init);
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

export const api = {
  contacts: () => j<Contact[]>('/contacts'),
  contact: (id: string) => j<Contact>(`/contacts/${id}`),
  updateContact: (id: string, body: Partial<Contact>) =>
    j<Contact>(`/contacts/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  calls: () => j<CallSession[]>('/calls'),
  call: (id: string) => j<CallSession>(`/calls/${id}`),
  transcript: (id: string) => j<TranscriptLine[]>(`/calls/${id}/transcript`),
  frames: (id: string) => j<SignalFrameRow[]>(`/calls/${id}/frames`),
  summary: (id: string) => j<CallSummaryRow>(`/calls/${id}/summary`),
  sentimentTrend: () =>
    j<Array<{ week: string; avg: number; count: number }>>('/analytics/sentiment'),
  promptTypes: () => j<Array<{ promptType: string; count: number }>>('/analytics/prompt-types'),
  objections: () => j<Array<{ objection: string; count: number }>>('/analytics/objections'),
};
```

**Step 9: `src/pages/Home.tsx`**

```tsx
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';

export default function Home() {
  const calls = useQuery({ queryKey: ['calls'], queryFn: api.calls });
  const prompts = useQuery({ queryKey: ['prompt-types'], queryFn: api.promptTypes });

  const recent = calls.data?.slice(0, 10) ?? [];
  const total = calls.data?.length ?? 0;
  const avg = calls.data
    ?.filter(c => c.sentimentAvg != null)
    .reduce((a, c, _, arr) => a + (c.sentimentAvg ?? 0) / arr.length, 0);
  const topPrompt = prompts.data?.sort((a, b) => b.count - a.count)[0];

  return (
    <div>
      <h2>Home</h2>
      <div className="stats">
        <div>
          Total calls: <b>{total}</b>
        </div>
        <div>
          Avg sentiment: <b>{avg ? Math.round(avg) : '—'}/100</b>
        </div>
        <div>
          Top prompt type: <b>{topPrompt?.promptType ?? '—'}</b>
        </div>
      </div>
      <h3>Recent calls</h3>
      <ul className="call-list">
        {recent.map(c => (
          <li key={c.id}>
            <Link to={`/calls/${c.id}`}>
              {new Date(c.startedAt).toLocaleString()} · {c.platform} · {c.callType}
              {c.durationMs && ` · ${Math.round(c.durationMs / 60000)}m`}
              {c.sentimentAvg != null && ` · ${Math.round(c.sentimentAvg)}/100`}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

**Step 10: `src/pages/Contacts.tsx`**

```tsx
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';

export default function Contacts() {
  const q = useQuery({ queryKey: ['contacts'], queryFn: api.contacts });
  return (
    <div>
      <h2>Contacts</h2>
      <table className="data-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Company</th>
            <th>Role</th>
            <th>Email</th>
          </tr>
        </thead>
        <tbody>
          {q.data?.map(c => (
            <tr key={c.id}>
              <td>
                <Link to={`/contacts/${c.id}`}>{c.name}</Link>
              </td>
              <td>{c.company ?? '—'}</td>
              <td>{c.role ?? '—'}</td>
              <td>{c.email ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

**Step 11: `src/pages/ContactDetail.tsx`**

```tsx
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { api } from '../lib/api';

export default function ContactDetail() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const contact = useQuery({ queryKey: ['contact', id], queryFn: () => api.contact(id) });
  const calls = useQuery({ queryKey: ['calls'], queryFn: api.calls });

  const [form, setForm] = useState({
    company: '',
    role: '',
    email: '',
    linkedinUrl: '',
    notes: '',
  });
  useEffect(() => {
    if (contact.data)
      setForm({
        company: contact.data.company ?? '',
        role: contact.data.role ?? '',
        email: contact.data.email ?? '',
        linkedinUrl: contact.data.linkedinUrl ?? '',
        notes: contact.data.notes ?? '',
      });
  }, [contact.data]);

  const update = useMutation({
    mutationFn: (body: Partial<typeof form>) => api.updateContact(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contact', id] }),
  });

  const myCalls = calls.data?.filter(c => c.contactId === id) ?? [];

  if (!contact.data) return <div>Loading…</div>;
  return (
    <div>
      <h2>{contact.data.name}</h2>
      <form
        className="contact-form"
        onSubmit={e => {
          e.preventDefault();
          update.mutate(form);
        }}
      >
        <label>
          Company{' '}
          <input
            value={form.company}
            onChange={e => setForm({ ...form, company: e.target.value })}
          />
        </label>
        <label>
          Role{' '}
          <input value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} />
        </label>
        <label>
          Email{' '}
          <input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
        </label>
        <label>
          LinkedIn{' '}
          <input
            value={form.linkedinUrl}
            onChange={e => setForm({ ...form, linkedinUrl: e.target.value })}
          />
        </label>
        <label>
          Notes{' '}
          <textarea
            value={form.notes}
            onChange={e => setForm({ ...form, notes: e.target.value })}
          />
        </label>
        <button type="submit">Save</button>
      </form>
      <h3>Calls ({myCalls.length})</h3>
      <ul>
        {myCalls.map(c => (
          <li key={c.id}>
            <a href={`/dashboard/calls/${c.id}`}>{new Date(c.startedAt).toLocaleString()}</a> —{' '}
            {c.callType}
            {c.sentimentAvg != null && ` · ${Math.round(c.sentimentAvg)}/100`}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

**Step 12: `src/pages/CallDetail.tsx`**

```tsx
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

export default function CallDetail() {
  const { id = '' } = useParams();
  const call = useQuery({ queryKey: ['call', id], queryFn: () => api.call(id) });
  const transcript = useQuery({ queryKey: ['transcript', id], queryFn: () => api.transcript(id) });
  const frames = useQuery({ queryKey: ['frames', id], queryFn: () => api.frames(id) });
  const summary = useQuery({
    queryKey: ['summary', id],
    queryFn: () => api.summary(id),
    retry: false,
  });

  if (!call.data) return <div>Loading…</div>;
  return (
    <div>
      <h2>Call · {new Date(call.data.startedAt).toLocaleString()}</h2>
      <div className="meta">
        {call.data.platform} · {call.data.callType} ·
        {call.data.durationMs && ` ${Math.round(call.data.durationMs / 60000)}m ·`}
        {call.data.sentimentAvg != null && ` ${Math.round(call.data.sentimentAvg)}/100`}
      </div>

      {summary.data && (
        <section>
          <h3>Summary</h3>
          <h4>Win signals</h4>
          <ul>
            {summary.data.winSignals.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
          <h4>Objections</h4>
          <ul>
            {summary.data.objections.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
          <h4>Decisions</h4>
          <ul>
            {summary.data.decisions.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
          <h4>Follow-up draft</h4>
          <pre className="followup">{summary.data.followUpDraft}</pre>
        </section>
      )}

      <section>
        <h3>Transcript</h3>
        <div className="transcript">
          {transcript.data?.map(l => (
            <div key={l.id}>
              <b>[{l.speaker}]</b> {l.text}
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3>Signal frames</h3>
        <ul className="frames">
          {frames.data?.map(f => (
            <li key={f.id}>
              <b>{f.promptType}</b> · conf {f.confidence.toFixed(2)} · sent {f.sentiment}
              {f.dangerFlag ? ' ⚠️' : ''} — {f.promptText}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
```

**Step 13: `src/styles.css`**

```css
* {
  box-sizing: border-box;
}
body {
  margin: 0;
  font:
    14px/1.5 -apple-system,
    system-ui,
    sans-serif;
  color: #e5e5e5;
  background: #0b0b0d;
}
.app {
  display: grid;
  grid-template-columns: 220px 1fr;
  min-height: 100vh;
}
.sidebar {
  padding: 24px 16px;
  background: #111114;
  border-right: 1px solid #222;
}
.sidebar h1 {
  margin: 0 0 24px;
  font-size: 18px;
  letter-spacing: 2px;
}
.sidebar a {
  display: block;
  color: #aaa;
  text-decoration: none;
  padding: 6px 0;
}
.sidebar a.active {
  color: #fff;
}
.content {
  padding: 32px;
}
.content h2 {
  margin: 0 0 16px;
}
.stats {
  display: flex;
  gap: 24px;
  margin-bottom: 24px;
}
.stats > div {
  padding: 12px 16px;
  background: #1a1a1f;
  border-radius: 8px;
}
.call-list {
  list-style: none;
  padding: 0;
}
.call-list li {
  padding: 8px 0;
  border-bottom: 1px solid #222;
}
.call-list a {
  color: #e5e5e5;
  text-decoration: none;
}
.data-table {
  width: 100%;
  border-collapse: collapse;
}
.data-table th,
.data-table td {
  padding: 10px;
  text-align: left;
  border-bottom: 1px solid #222;
}
.contact-form {
  display: grid;
  gap: 12px;
  max-width: 500px;
  margin-bottom: 24px;
}
.contact-form input,
.contact-form textarea {
  padding: 8px;
  background: #1a1a1f;
  border: 1px solid #333;
  color: #e5e5e5;
}
.contact-form button {
  padding: 8px 16px;
  background: #f59e0b;
  border: 0;
  color: #000;
  cursor: pointer;
}
.transcript {
  background: #1a1a1f;
  padding: 16px;
  border-radius: 8px;
  max-height: 400px;
  overflow-y: auto;
}
.followup {
  background: #1a1a1f;
  padding: 12px;
  border-radius: 8px;
  white-space: pre-wrap;
}
.frames {
  list-style: none;
  padding: 0;
}
.frames li {
  padding: 8px;
  border-bottom: 1px solid #222;
}
```

**Step 14: Modify `apps/server/package.json` scripts**

Replace scripts with:

```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "pnpm run build:dashboard && esbuild src/index.ts --bundle --platform=node --target=node22 --format=esm --outfile=dist/index.js --external:better-sqlite3",
    "build:dashboard": "pnpm --filter dashboard run build",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  }
}
```

Also add dashboard to workspace: ensure `pnpm-workspace.yaml` at repo root includes `apps/server/dashboard` via pattern like `apps/**` (check existing; if it includes only `apps/*`, add `apps/server/dashboard` explicitly).

Run: `cat pnpm-workspace.yaml` — if dashboard not covered, add `- apps/server/dashboard` and re-run `pnpm install` from repo root.

**Step 15: Build dashboard + verify**

Run: `cd apps/server && pnpm build:dashboard`
Expected: outputs files to `apps/server/public/` (including `index.html`, `assets/`).

Start server: `pnpm dev`
Visit `http://localhost:8080/dashboard/` in browser → SPA loads, shows Home page.

**Step 16: `.gitignore` the build output**

Add to repo root `.gitignore` (or create):

```
apps/server/public/assets
apps/server/public/index.html
apps/server/dist
apps/server/signal.db
apps/server/signal.db-*
```

Keep `apps/server/public/.gitkeep`.

**Step 17: Commit**

```bash
git add apps/server/dashboard apps/server/package.json .gitignore pnpm-workspace.yaml pnpm-lock.yaml
git commit -m "feat(dashboard): Vite+React SPA with Home, Contacts, ContactDetail, CallDetail"
```

---

## Task 12: Extension popup — `popup.html` + React components

**Files:**

- Create: `apps/extension/entrypoints/popup.html`
- Create: `apps/extension/entrypoints/popup.tsx`
- Create: `apps/extension/components/popup/PreCallSetup.tsx`
- Create: `apps/extension/components/popup/PostCallView.tsx`
- Create: `apps/extension/components/popup/OctaMemPanel.tsx`
- Create: `apps/extension/components/popup/popup.css`

**Step 1: `popup.html`**

```html
<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>SIGNAL</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./popup.tsx"></script>
  </body>
</html>
```

**Step 2: `popup.tsx`**

```tsx
import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { PreCallSetup } from '../components/popup/PreCallSetup';
import { PostCallView } from '../components/popup/PostCallView';
import type { PostCallSummary, Prospect } from '@signal/types';
import '../components/popup/popup.css';

type View = 'pre' | 'post';

function Popup() {
  const [view, setView] = useState<View>('pre');
  const [prospect, setProspect] = useState<Prospect>({
    name: '',
    company: '',
    email: '',
    linkedinUrl: '',
  });
  const [summary, setSummary] = useState<PostCallSummary | null>(null);

  // Load last detected prospect + any stored summary
  useEffect(() => {
    chrome.storage.session.get(['detectedProspect', 'latestSummary', 'popupView']).then(d => {
      if (d.detectedProspect) setProspect(p => ({ ...p, ...d.detectedProspect }));
      if (d.latestSummary) setSummary(d.latestSummary);
      if (d.popupView === 'post') setView('post');
    });
  }, []);

  const handleStart = async (callType: 'investor' | 'enterprise' | 'bd' | 'customer') => {
    await chrome.storage.session.set({ pendingProspect: prospect, pendingCallType: callType });
    chrome.runtime.sendMessage({ type: 'POPUP_START_REQUEST' });
    window.close();
  };

  return (
    <div className="popup">
      <header>SIGNAL</header>
      {view === 'pre' ? (
        <PreCallSetup prospect={prospect} onChange={setProspect} onStart={handleStart} />
      ) : summary ? (
        <PostCallView
          summary={summary}
          onNewCall={() => {
            setSummary(null);
            setView('pre');
          }}
        />
      ) : (
        <div className="empty">No summary available.</div>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<Popup />);
```

**Step 3: `PreCallSetup.tsx`**

```tsx
import { useState } from 'react';
import type { CallType, Prospect } from '@signal/types';
import { OctaMemPanel } from './OctaMemPanel';

interface Props {
  prospect: Prospect;
  onChange: (p: Prospect) => void;
  onStart: (callType: CallType) => void;
}

const CALL_TYPES: CallType[] = ['investor', 'enterprise', 'bd', 'customer'];

export function PreCallSetup({ prospect, onChange, onStart }: Props) {
  const [callType, setCallType] = useState<CallType>('investor');
  const canStart = prospect.name.trim().length > 0;

  return (
    <div className="pre-call">
      <section>
        <h3>Prospect</h3>
        <label>
          Name
          <input
            value={prospect.name}
            onChange={e => onChange({ ...prospect, name: e.target.value })}
          />
        </label>
        <label>
          Company
          <input
            value={prospect.company ?? ''}
            onChange={e => onChange({ ...prospect, company: e.target.value })}
          />
        </label>
        <label>
          Email
          <input
            value={prospect.email ?? ''}
            onChange={e => onChange({ ...prospect, email: e.target.value })}
          />
        </label>
        <label>
          LinkedIn URL
          <input
            value={prospect.linkedinUrl ?? ''}
            onChange={e => onChange({ ...prospect, linkedinUrl: e.target.value })}
          />
        </label>
      </section>

      <section>
        <h3>Call type</h3>
        <div className="pills">
          {CALL_TYPES.map(t => (
            <button
              key={t}
              className={callType === t ? 'pill active' : 'pill'}
              onClick={() => setCallType(t)}
            >
              {t}
            </button>
          ))}
        </div>
      </section>

      <OctaMemPanel prospect={prospect} />

      <button className="start-btn" disabled={!canStart} onClick={() => onStart(callType)}>
        Start Call
      </button>
    </div>
  );
}
```

**Step 4: `PostCallView.tsx`**

```tsx
import type { PostCallSummary } from '@signal/types';

export function PostCallView({
  summary,
  onNewCall,
}: {
  summary: PostCallSummary;
  onNewCall: () => void;
}) {
  const copy = () => navigator.clipboard.writeText(summary.followUpDraft);
  return (
    <div className="post-call">
      <h3>Call summary</h3>
      <h4>Win signals</h4>
      <ul>
        {summary.winSignals.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ul>
      <h4>Objections</h4>
      <ul>
        {summary.objections.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ul>
      <h4>Decisions</h4>
      <ul>
        {summary.decisions.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ul>
      <h4>Follow-up draft</h4>
      <pre className="followup">{summary.followUpDraft}</pre>
      <div className="actions">
        <button onClick={copy}>Copy</button>
        <button onClick={onNewCall}>New call</button>
      </div>
    </div>
  );
}
```

**Step 5: `OctaMemPanel.tsx`**

```tsx
import { useEffect, useState } from 'react';
import type { Prospect } from '@signal/types';

export function OctaMemPanel({ prospect }: { prospect: Prospect }) {
  const [context, setContext] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!prospect.name) {
      setContext(null);
      return;
    }
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        // Query through background (which knows the server URL)
        const res = await chrome.runtime.sendMessage({ type: 'OCTAMEM_QUERY', prospect });
        setContext(res?.context ?? null);
      } catch {
        setContext(null);
      }
      setLoading(false);
    }, 500);
    return () => clearTimeout(timer);
  }, [prospect.name, prospect.company]);

  return (
    <section className="octamem">
      <h4>OctaMem context</h4>
      {loading ? (
        <div className="muted">Loading…</div>
      ) : context ? (
        <p>{context}</p>
      ) : (
        <div className="muted">No prior context.</div>
      )}
    </section>
  );
}
```

**Step 6: `popup.css`**

```css
html,
body {
  margin: 0;
  width: 360px;
  font:
    13px/1.4 -apple-system,
    system-ui,
    sans-serif;
  color: #e5e5e5;
  background: #0b0b0d;
}
.popup {
  padding: 16px;
}
.popup header {
  font-size: 16px;
  letter-spacing: 2px;
  margin-bottom: 12px;
  color: #f59e0b;
}
.pre-call section {
  margin-bottom: 16px;
}
.pre-call h3 {
  font-size: 12px;
  text-transform: uppercase;
  color: #888;
  margin: 0 0 8px;
}
.pre-call label {
  display: block;
  margin-bottom: 8px;
  font-size: 11px;
  color: #aaa;
}
.pre-call input {
  width: 100%;
  padding: 6px 8px;
  background: #1a1a1f;
  border: 1px solid #333;
  color: #e5e5e5;
  border-radius: 4px;
}
.pills {
  display: flex;
  gap: 4px;
}
.pill {
  flex: 1;
  padding: 6px;
  background: #1a1a1f;
  border: 1px solid #333;
  color: #aaa;
  cursor: pointer;
  border-radius: 4px;
  font-size: 11px;
}
.pill.active {
  background: #f59e0b;
  color: #000;
  border-color: #f59e0b;
}
.octamem {
  background: #1a1a1f;
  padding: 12px;
  border-radius: 6px;
}
.octamem h4 {
  margin: 0 0 6px;
  font-size: 11px;
  color: #f59e0b;
  text-transform: uppercase;
}
.octamem .muted {
  color: #666;
  font-size: 11px;
}
.start-btn {
  width: 100%;
  padding: 10px;
  background: #f59e0b;
  color: #000;
  border: 0;
  font-weight: 600;
  cursor: pointer;
  border-radius: 4px;
  margin-top: 8px;
}
.start-btn:disabled {
  background: #333;
  color: #888;
  cursor: not-allowed;
}
.post-call h3 {
  margin: 0 0 12px;
}
.post-call h4 {
  margin: 12px 0 4px;
  font-size: 11px;
  color: #888;
  text-transform: uppercase;
}
.post-call ul {
  margin: 0;
  padding-left: 16px;
}
.followup {
  background: #1a1a1f;
  padding: 10px;
  border-radius: 4px;
  white-space: pre-wrap;
  font-size: 12px;
}
.actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}
.actions button {
  flex: 1;
  padding: 8px;
  background: #1a1a1f;
  border: 1px solid #333;
  color: #e5e5e5;
  cursor: pointer;
  border-radius: 4px;
}
```

**Step 7: Commit**

```bash
git add apps/extension/entrypoints/popup.html apps/extension/entrypoints/popup.tsx apps/extension/components/popup/
git commit -m "feat(extension): popup with pre-call setup + post-call view + OctaMem panel"
```

---

## Task 13: Update `content.tsx` — DOM scraping for prospect detection

**Files:**

- Modify: `apps/extension/entrypoints/content.tsx`

**Step 1: Add `detectProspectNames()` helper and MutationObserver**

Replace content.tsx with:

```tsx
import ReactDOM from 'react-dom/client';
import { createShadowRootUi } from 'wxt/client';
import { Overlay } from '../overlay/Overlay';
import { useSignalStore } from '../overlay/store';
import type { ServerMessage } from '@signal/types';

const PLATFORM_SELECTORS = {
  meet: '.zWGUib',
  zoom: '.participants-entry__name',
  teams: '[data-tid="roster-participant"]',
} as const;

function currentPlatform(): keyof typeof PLATFORM_SELECTORS | null {
  const h = location.hostname;
  if (h.includes('meet.google.com')) return 'meet';
  if (h.includes('zoom.us')) return 'zoom';
  if (h.includes('teams.microsoft.com')) return 'teams';
  return null;
}

function scrapeNames(platform: keyof typeof PLATFORM_SELECTORS): string[] {
  const sel = PLATFORM_SELECTORS[platform];
  const nodes = document.querySelectorAll<HTMLElement>(sel);
  const names = new Set<string>();
  nodes.forEach(n => {
    const t = n.textContent?.trim();
    if (t && t.length > 1 && t.length < 80) names.add(t);
  });
  return [...names];
}

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

    // Prospect detection via DOM scrape
    const platform = currentPlatform();
    if (platform) {
      const notify = () => {
        const names = scrapeNames(platform);
        if (names.length > 0) {
          chrome.runtime
            .sendMessage({ type: 'PROSPECT_DETECTED', platform, names })
            .catch(() => {});
        }
      };
      notify();
      const observer = new MutationObserver(() => notify());
      observer.observe(document.body, { childList: true, subtree: true });
      ctx.onInvalidated(() => observer.disconnect());
    }

    // START_CAPTURE fires only after popup sends "pending" prospect (handled via background).
    // Legacy auto-start kept as a dev fallback — background ignores it if prospect unavailable.
    chrome.runtime.sendMessage({ type: 'CONTENT_READY', platform }).catch(() => {});

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
        case 'summary':
          chrome.storage.session.set({ latestSummary: msg.summary, popupView: 'post' });
          store.setOverlayState('POSTCALL');
          break;
        case 'error':
          console.error('[SIGNAL] Server error:', msg.message);
          break;
      }
    });
  },
});
```

**Step 2: Commit**

```bash
git add apps/extension/entrypoints/content.tsx
git commit -m "feat(extension): DOM prospect detection + summary storage for popup"
```

---

## Task 14: Update `background.ts` — prospect storage + WS start carries prospect

**Files:**

- Modify: `apps/extension/entrypoints/background.ts`

**Step 1: Rewrite `background.ts`**

```ts
import type { ClientMessage, ServerMessage, Prospect, CallType } from '@signal/types';

declare const __WS_URL__: string;

const WS_URL = (typeof __WS_URL__ !== 'undefined' ? __WS_URL__ : 'ws://localhost:8080') + '/ws';
const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAYS = [1000, 2000, 4000] as const;

let wsocket: WebSocket | null = null;
let recorder: MediaRecorder | null = null;
let activeTabId: number | null = null;
let reconnectAttempt = 0;

export default defineBackground(() => {
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'PROSPECT_DETECTED') {
      const first = (msg.names as string[]).find(n => n.length > 1);
      if (first) chrome.storage.session.set({ detectedProspect: { name: first } });
      sendResponse({ ok: true });
      return;
    }

    if (msg.type === 'POPUP_START_REQUEST') {
      // User clicked Start Call — kick off capture on last active tab
      chrome.tabs.query({ active: true, lastFocusedWindow: true }).then(([tab]) => {
        if (tab?.id != null) {
          activeTabId = tab.id;
          startCapture(() => sendResponse({ ok: true }));
        }
      });
      return true;
    }

    if (msg.type === 'START_CAPTURE') {
      // Legacy auto-trigger from content.tsx — only proceed if prospect already present
      activeTabId = sender.tab?.id ?? null;
      chrome.storage.session.get(['pendingProspect']).then(d => {
        if (!d.pendingProspect) {
          sendResponse({ error: 'no prospect — open popup first' });
          return;
        }
        startCapture(sendResponse);
      });
      return true;
    }

    if (msg.type === 'STOP_CAPTURE') {
      stopCapture();
      sendResponse({ ok: true });
      return;
    }

    if (msg.type === 'OCTAMEM_QUERY') {
      // Popup can't hit the server directly with auth headers from popup context in some setups —
      // simplest is to GET through a Fastify proxy or call directly. For self-hosted, direct fetch works.
      queryOctaMem(msg.prospect as Prospect)
        .then(context => sendResponse({ context }))
        .catch(() => sendResponse({ context: null }));
      return true;
    }
  });
});

async function queryOctaMem(prospect: Prospect): Promise<string | null> {
  if (!prospect?.name) return null;
  try {
    const base = __WS_URL__.replace(/^ws/, 'http');
    const res = await fetch(`${base}/api/octamem/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prospect }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { context: string | null };
    return data.context;
  } catch {
    return null;
  }
}

function startCapture(sendResponse: (r: unknown) => void): void {
  chrome.tabCapture.capture({ audio: true, video: false }, stream => {
    if (!stream) {
      sendResponse({ error: chrome.runtime.lastError?.message ?? 'capture failed' });
      return;
    }
    connectWs(stream);
    sendResponse({ ok: true });
  });
}

async function connectWs(stream: MediaStream): Promise<void> {
  const { pendingProspect, pendingCallType } = await chrome.storage.session.get([
    'pendingProspect',
    'pendingCallType',
  ]);
  const prospect: Prospect = pendingProspect ?? { name: 'Unknown' };
  const callType: CallType = pendingCallType ?? 'enterprise';

  const ws = new WebSocket(WS_URL);
  wsocket = ws;

  ws.onopen = () => {
    reconnectAttempt = 0;
    const startMsg: ClientMessage = { type: 'start', platform: 'meet', callType, prospect };
    ws.send(JSON.stringify(startMsg));
    startRecorder(stream, ws);
  };

  ws.onmessage = event => {
    try {
      const msg = JSON.parse(event.data as string) as ServerMessage;
      if (activeTabId !== null) {
        chrome.tabs.sendMessage(activeTabId, msg).catch(() => {});
      }
      if (msg.type === 'summary') {
        chrome.storage.session.set({ latestSummary: msg.summary, popupView: 'post' });
      }
    } catch {
      /* ignore */
    }
  };

  ws.onerror = err => console.error('[SIGNAL] WS error:', err);

  ws.onclose = () => {
    stopRecorder();
    if (reconnectAttempt < MAX_RECONNECT_ATTEMPTS) {
      const delay = RECONNECT_DELAYS[reconnectAttempt] ?? 4000;
      reconnectAttempt++;
      setTimeout(() => {
        void connectWs(stream);
      }, delay);
    }
  };
}

function startRecorder(stream: MediaStream, ws: WebSocket): void {
  const mimeType = 'audio/webm;codecs=opus';
  if (!MediaRecorder.isTypeSupported(mimeType)) return;
  const rec = new MediaRecorder(stream, { mimeType });
  recorder = rec;
  rec.ondataavailable = e => {
    if (e.data.size > 0 && ws.readyState === WebSocket.OPEN) {
      void e.data.arrayBuffer().then(buf => ws.send(buf));
    }
  };
  rec.start(250);
}

function stopRecorder(): void {
  if (recorder?.state !== 'inactive') recorder?.stop();
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

**Step 2: Add OctaMem query endpoint to server**

Modify `apps/server/src/routes/api.ts` to add:

```ts
// Popup helper: query OctaMem via server (extension can't hold the key)
app.post('/api/octamem/query', async req => {
  const { prospect } = req.body as { prospect: { name: string; company?: string } };
  const { queryProspectContext } = await import('../services/octamem.js');
  const context = await queryProspectContext({
    apiKey: process.env.OCTAMEM_API_KEY ?? '',
    prospect,
  });
  return { context };
});
```

**Step 3: Commit**

```bash
git add apps/extension/entrypoints/background.ts apps/server/src/routes/api.ts
git commit -m "feat(extension): pass prospect to WS start; popup OctaMem proxy endpoint"
```

---

## Task 15: Update `wxt.config.ts` — register popup entry

**Files:**

- Modify: `apps/extension/wxt.config.ts`

**Step 1: Add popup to manifest**

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
    host_permissions: [
      '*://meet.google.com/*',
      '*://*.zoom.us/*',
      '*://teams.microsoft.com/*',
      'http://localhost:8080/*',
    ],
    action: {
      default_popup: 'popup.html',
      default_title: 'SIGNAL',
    },
  },
  vite: () => ({
    plugins: [tailwindcss()],
    define: {
      __WS_URL__: JSON.stringify(process.env.WS_URL ?? 'ws://localhost:8080'),
    },
    resolve: {
      alias: { '@signal/types': '../../packages/types/index.ts' },
    },
  }),
});
```

**Step 2: Build extension**

Run: `cd apps/extension && pnpm dev:ext` (or `pnpm build`)
Expected: WXT detects `entrypoints/popup.html` + `popup.tsx`, builds popup.

Load unpacked extension in Chrome → click toolbar icon → popup opens with pre-call form.

**Step 3: Commit**

```bash
git add apps/extension/wxt.config.ts
git commit -m "feat(extension): register popup action + localhost host permission"
```

---

## Task 16: Final verification

**Step 1: Run full test suite from repo root**

Run: `pnpm -r test`
Expected: all tests PASS (existing 18 + new tests from Tasks 3, 4, 5, 6, 9).

**Step 2: Typecheck**

Run: `pnpm -r typecheck`
Expected: clean across all packages.

**Step 3: Full build**

Run: `pnpm -r build`
Expected: server bundles to `apps/server/dist/index.js`, dashboard built into `apps/server/public/`, extension built to `apps/extension/.output/`.

**Step 4: End-to-end smoke test**

Terminal 1:

```bash
cd apps/server && pnpm dev
```

Expected: logs placeholder warnings, listens on :8080.

Terminal 2:

```bash
curl -s http://localhost:8080/health        # → { ok: true, ts: ... }
curl -s http://localhost:8080/api/contacts  # → []
curl -s http://localhost:8080/api/calls     # → []
```

Visit `http://localhost:8080/dashboard/` → SPA loads; Home shows 0 calls; Contacts empty.

Load extension in Chrome, open a Google Meet, click SIGNAL icon → popup opens with prospect form. Fill name + company, click Start Call. Server logs show `start` received with prospect, DB should have a new row in `contacts` + `call_sessions`.

Refresh dashboard → new contact + call visible.

**Step 5: Verify DB persistence**

Run: `sqlite3 apps/server/signal.db "SELECT * FROM contacts;"`
Expected: the contact you just created.

Run: `sqlite3 apps/server/signal.db "SELECT * FROM call_sessions;"`
Expected: the call session with matching `contact_id`.

**Step 6: Final commit (if any leftover changes)**

```bash
git status
# commit any stragglers
```

**Step 7: Declare Phase 4 done**

Check each success criterion from the design doc §"Phase 4 Success Criteria" (1–12). All green ⇒ Phase 4 complete.

---

## Post-plan notes

- **Drizzle migrations skipped** — `CREATE TABLE IF NOT EXISTS` DDL runs on startup. If the schema ever needs to change destructively, add a proper migration step. For now: YAGNI.
- **OctaMem API shape assumed** — if the real `octamem.com` REST API differs, changes are isolated to `apps/server/src/services/octamem.ts`. The interface (`queryProspectContext`, `storeCallMemory`) is stable.
- **Call-session lifetime** — the WS route creates `sessionId` at connection time but only inserts the row once `start` arrives. If a client connects and never sends `start`, no DB row is created. Intentional: unknown-prospect sessions are noise.
- **Summary model fallback** — if `generateSummary` returns null (placeholder keys or malformed output), the server simply skips persistence and OctaMem push. Overlay stays in LIVE state.
- **Dashboard auth** — none. Intentional for self-hosted single user. Bind Fly service to a private IPv6 if more security wanted.
