# SIGNAL — Phase 4 Design Doc

**Date:** 2026-04-14
**Scope:** Post-call summary · CRM · Call history + analytics · OctaMem integration · Extension popup · Web dashboard · Provider-agnostic AI
**Goal:** Close the pre/post call loop via OctaMem, persist every call to SQLite, surface insights in a web dashboard and extension popup.

---

## Decisions

| Decision            | Choice                                       | Reason                                                           |
| ------------------- | -------------------------------------------- | ---------------------------------------------------------------- |
| Server architecture | Monolith expansion                           | Self-hosted, single user — one `fly deploy` covers everything    |
| Database            | SQLite via Drizzle ORM                       | Persistent Fly volume, zero extra infra, perfect for single-user |
| Dashboard           | Vite + React SPA in `apps/server/dashboard/` | Built to `apps/server/public/`, served by `@fastify/static`      |
| AI provider         | Pluggable: Claude direct or OpenRouter       | Open-source BYOK — users choose their provider                   |
| Live nudge model    | `claude-haiku-4-5-20251001` (default)        | ~400ms TTFT, structured JSON reliable                            |
| Summary model       | `claude-sonnet-4-6` (default)                | One-shot reasoning for post-call synthesis                       |
| LinkedIn            | Manual URL paste                             | Zero API cost, zero ToS risk, sufficient for personal use        |
| Prospect detection  | Hybrid DOM scrape + manual popup fallback    | Best-effort auto, always correctable                             |
| OctaMem             | Natural language add + query via REST API    | Semantic memory — compounds across every call                    |
| Auth                | None — self-hosted, single user              | Open source: each user owns their instance                       |

---

## System Architecture

```
Chrome Extension
 ├── popup.tsx          — pre-call setup, OctaMem context preview, post-call summary view
 ├── content.tsx        — DOM scraping for prospect auto-detect, server message listener
 └── background.ts      — passes prospect info in WS start message

Fastify Server (apps/server/src/)
 ├── routes/ws.ts       — updated: accepts prospect, persists transcript + frames, generates summary on stop
 ├── routes/api.ts      — REST API: contacts CRUD, call history, analytics
 ├── services/db.ts     — Drizzle ORM + better-sqlite3
 ├── services/ai.ts     — AIProvider interface: ClaudeProvider + OpenRouterProvider
 ├── services/claude.ts — updated: uses AIProvider abstraction
 ├── services/summary.ts — post-call summary generation (Sonnet)
 ├── services/octamem.ts — pre-call context query, post-call memory push
 └── /public/           — built dashboard SPA (@fastify/static)

Dashboard (apps/server/dashboard/ — Vite + React)
 ├── /                  — recent calls + quick stats
 ├── /contacts          — CRM contact list
 ├── /contacts/:id      — contact detail + full call history + OctaMem panel
 └── /calls/:id         — call detail: transcript, signal frames, summary

OctaMem (octamem.com REST API)
 ├── Pre-call query     — pull context on prospect → inject into Claude system prompt
 └── Post-call push     — store summary + insights → compounds every call

SQLite (Fly persistent volume: /data/signal.db)
 ├── contacts
 ├── call_sessions
 ├── transcript_lines
 ├── signal_frames
 └── call_summaries
```

---

## Data Flow — Per Call

```
1. User opens Meet/Zoom/Teams page
2. content.tsx scrapes participant names from DOM
3. Background sends detected names to popup
4. Popup shows pre-filled prospect fields (or blank if detection failed)
5. User confirms/corrects: name, company, email, LinkedIn URL, call type
6. Popup queries OctaMem → displays "What SIGNAL remembers" about this prospect
7. User clicks [Start Call]
8. background.ts sends WS start with full prospect info
9. Server: upsert contact in SQLite, create call_session row
10. Server: query OctaMem for prospect context
11. OctaMem context injected into Claude system prompt (third block after company.md)
12. Call runs: transcript lines persisted, signal frames persisted, Claude fires every 12s
13. stop message received (tab close or popup button)
14. Server: fetch full transcript, call Claude Sonnet for PostCallSummary
15. Summary persisted to call_summaries, call_sessions updated (ended_at, duration, sentiment_avg)
16. Server: push call memory to OctaMem
17. Server: send { type: 'summary', summary } over WS
18. Overlay → POSTCALL state, popup → post-call view
19. Dashboard reflects new call + updated contact history
```

---

## Database Schema

```ts
// contacts
{
  id:           text (uuid, pk)
  name:         text (not null)
  email:        text (nullable)
  linkedin_url: text (nullable)
  company:      text (nullable)
  role:         text (nullable)
  notes:        text (nullable)        // freeform, editable in dashboard
  octamem_id:   text (nullable)        // OctaMem memory ID after first call
  created_at:   integer (unix ms)
  updated_at:   integer (unix ms)
}

// call_sessions
{
  id:            text (uuid, pk)
  contact_id:    text (fk → contacts.id, nullable)
  platform:      text ('meet' | 'zoom' | 'teams')
  call_type:     text (CallType)
  started_at:    integer (unix ms)
  ended_at:      integer (unix ms, nullable)
  duration_ms:   integer (nullable)
  sentiment_avg: real (nullable)       // computed on summary generation
}

// transcript_lines
{
  id:         integer (autoincrement, pk)
  session_id: text (fk → call_sessions.id)
  speaker:    text ('user' | 'prospect')
  text:       text
  timestamp:  integer (unix ms)
}

// signal_frames
{
  id:          integer (autoincrement, pk)
  session_id:  text (fk → call_sessions.id)
  prompt_type: text (PromptType)
  prompt_text: text
  confidence:  real
  sentiment:   integer
  danger_flag: integer (0 | 1)
  created_at:  integer (unix ms)
}

// call_summaries
{
  id:              text (uuid, pk)
  session_id:      text (fk → call_sessions.id, unique)
  win_signals:     text (JSON array)
  objections:      text (JSON array)
  decisions:       text (JSON array)
  follow_up_draft: text
  created_at:      integer (unix ms)
}
```

---

## AI Provider Abstraction

### `services/ai.ts`

```ts
interface AIProvider {
  complete(opts: {
    systemPrompt: string
    userPrompt: string
    maxTokens: number
    cache?: boolean       // prompt caching — Claude only, silently ignored by OpenRouter
  }): Promise<string | null>
}

class ClaudeProvider implements AIProvider
  // uses @anthropic-ai/sdk
  // supports cache_control: { type: 'ephemeral' } on system prompt

class OpenRouterProvider implements AIProvider
  // POST https://openrouter.ai/api/v1/chat/completions
  // OpenAI-compatible, Authorization: Bearer OPENROUTER_API_KEY

function createAIProvider(config: EnvConfig): AIProvider
  // reads AI_PROVIDER, ANTHROPIC_API_KEY, OPENROUTER_API_KEY
  // returns ClaudeProvider or OpenRouterProvider
  // returns NoOpProvider if keys are placeholders (all methods return null)
```

### Environment

```
# Provider selection
AI_PROVIDER=claude           # 'claude' | 'openrouter'

# Claude (direct)
ANTHROPIC_API_KEY=sk-ant-your-key-here

# OpenRouter (alternative)
OPENROUTER_API_KEY=sk-or-your-key-here

# Model overrides (optional — defaults below are used if unset)
LIVE_MODEL=claude-haiku-4-5-20251001
SUMMARY_MODEL=claude-sonnet-4-6

# OctaMem
OCTAMEM_API_KEY=your-octamem-key-here

# Database
DATABASE_URL=/data/signal.db

# Existing
DEEPGRAM_API_KEY=your-deepgram-key-here
PORT=8080
NODE_ENV=development
```

---

## OctaMem Integration

### `services/octamem.ts`

```ts
// Pre-call: query for prospect context
async function queryProspectContext(prospect: {
  name: string;
  company?: string;
}): Promise<string | null>;
// → octamem_query("name + company — what do we know?")
// → returns string injected into Claude system prompt
// → null if OCTAMEM_API_KEY is placeholder (graceful no-op)

// Post-call: push call memory
async function storeCallMemory(opts: {
  contact: { name: string; company?: string; role?: string };
  callType: CallType;
  durationMs: number;
  sentimentAvg: number;
  summary: PostCallSummary;
  dangerMoments: Array<{ reason: string; timestamp: number }>;
}): Promise<string | null>;
// → octamem_add(formatted memory string, previousContext)
// → returns OctaMem memory ID (stored in contacts.octamem_id)
```

**Memory format pushed post-call:**

```
Call: {name} ({role}, {company}) — {date}, {duration} min, {callType}
Sentiment: {avg}/100

Win signals: {list}
Objections: {list}
Decisions: {list}
Follow-up: "{draft}"

Danger moments: {list with timestamps}
```

**System prompt injection (pre-call):**

```
## Prior Context on This Prospect
{octamem_query_result}
```

Appended after `company.md` block. Empty string if no prior context found.

---

## Prospect Detection

### DOM Selectors

```ts
const SELECTORS = {
  meet: '.zWGUib', // participant name chips
  zoom: '.participants-entry__name',
  teams: '[data-tid="roster-participant"]',
};
```

### Flow

1. `content.tsx` observes DOM with `MutationObserver` for participant elements
2. Detected names sent to background via `chrome.runtime.sendMessage({ type: 'PROSPECT_DETECTED', names })`
3. Background forwards to popup if open, or stores for when popup opens
4. Popup pre-fills name field with first non-self detected name
5. If detection yields nothing → popup opens blank (manual mode)
6. User fills in / confirms → clicks [Start Call]

### Updated `ClientMessage`

```ts
type ClientMessage =
  | {
      type: 'start';
      platform: 'meet' | 'zoom' | 'teams';
      callType: CallType;
      prospect: {
        name: string;
        company?: string;
        email?: string;
        linkedinUrl?: string;
      };
    }
  | { type: 'stop' };
```

---

## Post-Call Summary

### Trigger

`stop` message received on WS connection.

### Server Flow (`routes/ws.ts` on stop)

```
1. session.end()
2. Fetch all transcript_lines for session from DB
3. Call ai.complete() with summary prompt (SUMMARY_MODEL, max 600 tokens)
4. Parse PostCallSummary JSON
5. Persist to call_summaries
6. Update call_sessions: ended_at, duration_ms, sentiment_avg
7. storeCallMemory() → push to OctaMem
8. Send { type: 'summary', summary } over WS
9. Overlay state → 'POSTCALL'
```

### Summary Prompt

System: role + output schema (PostCallSummary JSON)
User: full transcript (all lines, not rolling window) + call metadata

### Updated `ServerMessage`

```ts
type ServerMessage =
  | { type: 'connected'; sessionId: string }
  | { type: 'transcript'; line: TranscriptLine }
  | { type: 'frame'; frame: SignalFrame }
  | { type: 'state'; overlayState: OverlayState }
  | { type: 'summary'; summary: PostCallSummary }
  | { type: 'error'; message: string };
```

---

## Extension Popup

### Entry Points

```
apps/extension/entrypoints/popup.html  — popup HTML shell
apps/extension/entrypoints/popup.tsx   — React root
apps/extension/components/popup/       — popup components
  PreCallSetup.tsx
  PostCallView.tsx
  OctaMemPanel.tsx
```

### Pre-call UI

```
[SIGNAL]

Prospect
  Name     [                    ]
  Company  [                    ]
  Email    [                    ] optional
  LinkedIn [                    ] optional

Call type  [● Investor] [Enterprise] [BD] [Customer]

── OctaMem context ─────────────────────────
"Last spoke 2026-03-10 (28 min, investor).
 Raised burn rate objection. Wants traction
 proof by Q2. Positive on team."
────────────────────────────────────────────

              [Start Call]
```

### Post-call UI

```
[SIGNAL — Call ended · 34 min]

Win signals
  · Asked about Series A timing
  · Engaged on cap table structure

Objections
  · Concerned about burn rate
  · Wants 6-month traction proof

Decisions
  · Send deck by Friday

Follow-up draft
┌─────────────────────────────────────────┐
│ James, great speaking today —           │
│ attaching the deck as discussed...      │
└─────────────────────────────────────────┘
[Copy]                      [Save to OctaMem]
```

---

## Web Dashboard

**Build:** `apps/server/dashboard/` — Vite + React + TanStack Router
**Serve:** `@fastify/static` pointing at `apps/server/public/` (dashboard build output)
**API:** All data from `GET /api/*` endpoints

### Pages

**`/` — Home**

- Last 10 calls list (name, company, type, duration, sentiment, date)
- Stats: total calls, avg sentiment (30 days), most triggered prompt type

**`/contacts` — CRM**

- Searchable/sortable table: name, company, role, email, LinkedIn, last called, call count, avg sentiment
- [+ New Contact] button

**`/contacts/:id` — Contact detail**

- Editable contact card
- OctaMem panel: live `queryProspectContext()` on load — "What SIGNAL remembers"
- Call history timeline with sentiment scores
- Aggregated: top objections, top win signals, decisions across all calls

**`/calls/:id` — Call detail**

- Metadata header: date, duration, platform, call type, sentiment
- Transcript panel: speaker-labelled, timestamped lines
- Signal frames timeline: prompt type, text, confidence, danger flags
- Summary card: win signals, objections, decisions, follow-up draft (copyable)

### REST API (`routes/api.ts`)

```
GET    /api/contacts
POST   /api/contacts
GET    /api/contacts/:id
PUT    /api/contacts/:id
DELETE /api/contacts/:id

GET    /api/calls
GET    /api/calls/:id
GET    /api/calls/:id/transcript
GET    /api/calls/:id/frames
GET    /api/calls/:id/summary

GET    /api/analytics/sentiment        — sentiment over time (by week)
GET    /api/analytics/objections       — most frequent objection strings
GET    /api/analytics/prompt-types     — which PromptTypes fired most
```

---

## Files Created / Modified

### New

```
apps/server/src/services/ai.ts            — AIProvider interface + Claude + OpenRouter impls
apps/server/src/services/octamem.ts       — OctaMem query + store
apps/server/src/services/summary.ts       — post-call summary generation
apps/server/src/services/db.ts            — Drizzle ORM setup + schema
apps/server/src/routes/api.ts             — REST API routes
apps/server/dashboard/                    — Vite + React SPA
  dashboard/index.html
  dashboard/src/main.tsx
  dashboard/src/pages/Home.tsx
  dashboard/src/pages/Contacts.tsx
  dashboard/src/pages/ContactDetail.tsx
  dashboard/src/pages/CallDetail.tsx
  dashboard/src/components/
  dashboard/vite.config.ts
  dashboard/package.json
  dashboard/tsconfig.json
apps/extension/entrypoints/popup.html
apps/extension/entrypoints/popup.tsx
apps/extension/components/popup/PreCallSetup.tsx
apps/extension/components/popup/PostCallView.tsx
apps/extension/components/popup/OctaMemPanel.tsx
```

### Modified

```
apps/server/src/services/claude.ts        — refactored to use AIProvider
apps/server/src/routes/ws.ts              — accept prospect, persist data, generate summary on stop
apps/server/src/index.ts                  — register api route, static serving, DB init, Fly volume mount
apps/server/package.json                  — add: drizzle-orm, better-sqlite3, @fastify/static, @types/better-sqlite3
apps/server/.env.example                  — add: AI_PROVIDER, OPENROUTER_API_KEY, LIVE_MODEL, SUMMARY_MODEL, OCTAMEM_API_KEY, DATABASE_URL
apps/extension/entrypoints/background.ts  — store prospect, pass to WS start, handle PROSPECT_DETECTED
apps/extension/entrypoints/content.tsx    — DOM scraping + PROSPECT_DETECTED message
apps/extension/wxt.config.ts              — register popup entry point
packages/types/index.ts                   — update ClientMessage (prospect), ServerMessage (summary)
turbo.json                                — add dashboard build task
```

---

## Phase 4 Success Criteria

1. `pnpm dev:server` — server starts, DB initialised at `/data/signal.db` (or `./signal.db` in dev)
2. Popup opens on Meet/Zoom/Teams — auto-fills prospect name from DOM or falls back to blank
3. OctaMem context loads in popup within 2s of name entry (or shows empty gracefully)
4. WS `start` carries prospect info — contact upserted in DB
5. Transcript lines + signal frames persisted in real time during call
6. On call end: PostCallSummary generated, persisted, pushed to OctaMem, sent to overlay
7. Overlay transitions to POSTCALL state showing summary
8. Dashboard at `localhost:8080/dashboard` loads — contacts list, call history visible
9. `/calls/:id` shows full transcript + summary
10. OctaMem panel on `/contacts/:id` shows compounded memory across calls
11. `AI_PROVIDER=openrouter` with valid key — live nudges and summary work via OpenRouter
12. All Vitest tests pass (new: db service, summary service, api routes)
