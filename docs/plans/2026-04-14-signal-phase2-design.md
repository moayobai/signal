# SIGNAL — Phase 2+3 Design Doc
**Date:** 2026-04-14
**Scope:** Full live pipeline — audio capture → Deepgram STT → Claude Haiku live prompts → overlay
**Goal:** Replace mock fixture with real data. When keys are inserted, SIGNAL is live.

---

## Decisions

| Decision | Choice | Reason |
|---|---|---|
| Deepgram connection | Server-side | No key exposure in extension; spec-aligned |
| Audio format | `audio/webm;codecs=opus` via MediaRecorder | Native browser support, 250ms chunks, Deepgram-compatible |
| Live AI model | `claude-haiku-4-5-20251001` | Fastest Claude, ~400ms TTFT, structured JSON reliable |
| Claude trigger | 12s interval + ≥2 new transcript lines | Avoids redundant calls on silence |
| Prompt caching | System prompt cached (company.md rarely changes) | ~4× cheaper per live call |
| Backend host | localhost:8080 dev, Fly.io (lhr region) prod | Low latency EU; one-command deploy |
| API keys | `.env.example` placeholders, real keys in `.env` | Full pipeline scaffolded, flip live on key insertion |
| Server runtime | `tsx` (dev), `esbuild` bundle (prod) | Zero-config TS execution for dev; fast single-file build for prod |

---

## System Architecture

```
Chrome Extension
 ├── background.ts (service worker)
 │    ├── chrome.tabCapture.capture()  → MediaStream (tab audio only)
 │    ├── MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus', timeslice: 250 })
 │    │    └── ondataavailable → ws.send(chunk)  [binary]
 │    ├── WebSocket → ws://localhost:8080/ws  (dev)
 │    │             → wss://signal.fly.dev/ws  (prod, via env var)
 │    ├── onmessage → parse JSON → chrome.tabs.sendMessage(activeTabId, msg)
 │    └── Reconnect: exponential backoff, 3 attempts, 1s / 2s / 4s
 │
 └── content.tsx
      ├── On mount: chrome.runtime.sendMessage({ type: 'START_CAPTURE' })
      ├── chrome.runtime.onMessage.addListener
      │    ├── SIGNAL_FRAME   → store.setFrame(msg.frame)
      │    ├── TRANSCRIPT_LINE → store.appendTranscriptLine(msg.line)
      │    └── OVERLAY_STATE  → store.setOverlayState(msg.state)
      └── Overlay (useMockFixture=false)

Fastify Server  (apps/server/src/)
 ├── index.ts           — app bootstrap, WS plugin, env validation
 ├── routes/ws.ts       — one WS connection per call session
 ├── services/
 │    ├── deepgram.ts   — Nova-3 streaming client wrapper
 │    ├── claude.ts     — Haiku caller, prompt caching, JSON parse + validate
 │    └── session.ts    — rolling 90s window, 12s scheduler, danger detection
 └── prompts/live.ts    — system prompt builder (injects company.md)

External APIs
 ├── Deepgram  wss://api.deepgram.com/v1/listen   (Nova-3, diarize=true)
 └── Anthropic https://api.anthropic.com/v1/messages  (Haiku 4.5)
```

---

## WebSocket Message Protocol

All messages typed in `packages/types/index.ts`.

### Extension → Server
```ts
// JSON control
type ClientMessage =
  | { type: 'start'; platform: 'meet' | 'zoom' | 'teams'; callType: CallType }
  | { type: 'stop' }

// Binary audio: raw ArrayBuffer chunks (250ms of audio/webm)
```

### Server → Extension
```ts
type ServerMessage =
  | { type: 'connected'; sessionId: string }
  | { type: 'transcript'; line: TranscriptLine }
  | { type: 'frame'; frame: SignalFrame }
  | { type: 'state'; overlayState: OverlayState }
  | { type: 'error'; message: string }
```

---

## Data Flow — Live Call

```
1. Content script detects call page (URL match + video element present)
2. → chrome.runtime.sendMessage({ type: 'START_CAPTURE' })
3. Background: chrome.tabCapture.capture({ audio: true, video: false })
4. Background: MediaRecorder starts, chunks every 250ms
5. Background: WebSocket opens → sends { type: 'start', platform, callType }
6. Server: creates CallSession, opens Deepgram streaming connection
7. Binary audio chunks flow: Extension → Server → Deepgram
8. Deepgram emits transcript deltas (final only, diarize=true)
9. Server: push { type: 'transcript', line } to client + append to window
10. Client: store.appendTranscriptLine(line) → TranscriptFeed updates
11. Server: every 12s (if ≥2 new lines): call Claude Haiku
12. Claude returns SignalFrame JSON
13. Server: push { type: 'frame', frame } to client
14. Client: store.setFrame(frame) → PromptCard + SentimentArc + BodyLangRead update
15. Server: danger detection runs continuously:
     - 30s silence     → { type: 'state', overlayState: 'DANGER' } + SILENCE prompt
     - Pricing keyword → WARN prompt
     - Competitor name → WARN prompt
```

---

## Server Implementation Details

### `routes/ws.ts`
```ts
fastify.register(require('@fastify/websocket'));
fastify.get('/ws', { websocket: true }, async (socket, req) => {
  const session = new CallSession();
  const dgClient = createDeepgramClient(socket, session);

  socket.on('message', (data) => {
    if (Buffer.isBuffer(data)) {
      dgClient.send(data);           // pipe audio to Deepgram
    } else {
      const msg = JSON.parse(data.toString()) as ClientMessage;
      if (msg.type === 'stop') session.end();
    }
  });

  socket.on('close', () => {
    dgClient.finish();
    session.end();
  });
});
```

### `services/session.ts`
```ts
// Rolling window: keeps last 90s of TranscriptLine[]
// Scheduler: setInterval(12000), fires Claude if:
//   - window.newLinesSinceLastCall >= 2
//   - NOT currently awaiting a Claude response (debounce)
// Danger detection:
//   - lastTranscriptAt: track silence (>30s → SILENCE prompt)
//   - Keyword scan: PRICING_KEYWORDS, COMPETITOR_NAMES (from company.md)
// Returns: cleanup function
```

### `services/claude.ts`
```ts
// Uses @anthropic-ai/sdk
// Model: claude-haiku-4-5-20251001
// System prompt: cached (cache_control: { type: 'ephemeral' })
// Max tokens: 300 (SignalFrame JSON is small)
// Fallback: if API key is placeholder → return null (overlay stays on last frame)
// Parse: JSON.parse(response.content[0].text) → validate against SignalFrame shape
```

### `prompts/live.ts`
```ts
// Loads knowledge/company.md from repo root
// Builds system prompt with:
//   - SIGNAL role definition
//   - Company context (injected)
//   - Call type + prospect info
//   - Output schema (SignalFrame JSON)
//   - Rules (max 160 chars, always return all fields, IDLE if no action needed)
```

---

## Danger Detection (server-side, Phase 2)

No body language in Phase 2 (Phase 4). Danger triggers from transcript only:

| Trigger | Condition | Prompt type |
|---|---|---|
| Silence | No transcript line for 30s | `SILENCE` |
| Pricing | Line contains: price, cost, expensive, budget, afford | `WARN` |
| Competitor | Line contains name from competitors list in company.md | `WARN` |
| Recovery | 2+ new lines after a danger state | back to `LIVE` |

---

## Extension Changes

### `background.ts` (full rewrite of stub)
```ts
// State: wsocket, recorder, activeTabId
// Messages handled:
//   START_CAPTURE → tabCapture + MediaRecorder + WS connect
//   STOP_CAPTURE  → recorder.stop() + ws.close()
// WS reconnect: 3 attempts, backoff 1s/2s/4s
// On WS message: chrome.tabs.sendMessage(activeTabId, parsedMsg)
```

### `content.tsx` (two additions)
```ts
// 1. On mount: detect call (URL + video element)
//    → chrome.runtime.sendMessage({ type: 'START_CAPTURE' })
// 2. chrome.runtime.onMessage listener → store updates
```

### `Overlay.tsx` — no changes needed
### `wxt.config.ts` — add `tabCapture` permission

---

## Files Created / Modified

### New
```
apps/server/src/index.ts              — Fastify bootstrap
apps/server/src/routes/ws.ts          — WebSocket handler
apps/server/src/services/deepgram.ts  — Deepgram client
apps/server/src/services/claude.ts    — Claude Haiku caller
apps/server/src/services/session.ts   — Session + window manager
apps/server/src/prompts/live.ts       — System prompt builder
apps/server/Dockerfile
apps/server/fly.toml
apps/server/.env.example
apps/server/tsconfig.json
knowledge/company.md                  — Company context template
```

### Modified
```
apps/server/package.json              — add deps: fastify, ws, deepgram, anthropic, tsx, esbuild
apps/extension/entrypoints/background.ts  — full audio capture + WS client
apps/extension/entrypoints/content.tsx    — message listener + START_CAPTURE trigger
apps/extension/wxt.config.ts             — add tabCapture permission
packages/types/index.ts                  — add ClientMessage + ServerMessage types
turbo.json                               — update server dev/build scripts
```

---

## Environment

### `apps/server/.env.example`
```
ANTHROPIC_API_KEY=sk-ant-your-key-here
DEEPGRAM_API_KEY=your-deepgram-key-here
JWT_SECRET=change-me-in-production
PORT=8080
NODE_ENV=development
WS_URL=ws://localhost:8080
```

### `apps/extension` env
WS_URL injected via `wxt.config.ts` vite define:
```ts
define: {
  __WS_URL__: JSON.stringify(process.env.WS_URL ?? 'ws://localhost:8080')
}
```

---

## Testing Strategy

| Layer | Test | Approach |
|---|---|---|
| `session.ts` — rolling window | Unit: trim at 90s, newLines counter resets after Claude call | Vitest, fake timers |
| `session.ts` — danger detection | Unit: keywords trigger correct prompt type, silence at 30s | Vitest, fake timers |
| `claude.ts` — JSON parse | Unit: valid response parsed to SignalFrame, invalid response returns null | Vitest, mock SDK |
| `routes/ws.ts` | Integration: mock Deepgram + mock Claude, assert server pushes correct messages | Vitest + mock WS client |
| Audio capture | Manual: Chrome extension on meet.google.com, transcript visible in overlay | Manual |

---

## Dev Commands

```bash
# Terminal 1 — Backend
cd apps/server && cp .env.example .env  # insert real keys when ready
pnpm dev                                 # tsx watch src/index.ts on :8080

# Terminal 2 — Extension
pnpm dev:ext                             # WXT dev mode in Chrome

# Full pipeline (with real keys)
# 1. Open meet.google.com
# 2. Start/join a call
# 3. Overlay appears, transcript fills in, prompts fire every 12s
```

---

## Phase 2+3 Success Criteria

1. `pnpm dev` starts Fastify on `:8080` with no errors (placeholder keys OK)
2. Extension connects to `ws://localhost:8080/ws` on call page load
3. `START_CAPTURE` message triggers `chrome.tabCapture` without error
4. Audio chunks flow: extension → server (verify with server-side log)
5. With real Deepgram key: transcript lines appear in overlay within 1s of speech
6. With real Anthropic key: PromptCard updates every ~12s with Claude output
7. Danger detection: 30s silence → overlay state = DANGER + SILENCE prompt
8. `pnpm test` → all vitest tests pass (session + claude unit tests)
9. `pnpm build` (server) → `dist/index.js` produced
10. `fly deploy` (from apps/server) → deploys to Fly.io without error
