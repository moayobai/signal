# SIGNAL

Real-time AI sales coach running live in your browser calls. SIGNAL listens to your calls, reads body language signals, and surfaces nudges, danger warnings, and closing prompts — all inside a floating glass HUD.

**Self-hosted. Single-user. No data leaves your machine (except to your AI provider).**

---

## What it does

| Feature | Details |
|---|---|
| **Live nudges** | Claude Haiku analyses transcript every ~12s and fires `ASK`, `REFRAME`, `WARN`, `CLOSE`, or `SILENCE` cues |
| **Danger detection** | Sentiment drop + posture shift → DANGER state with red pulse |
| **On-call HUD** | Top-centre nudge card + right-edge sidebar (sentiment ring, body language, cue history, transcript tail) |
| **Post-call summary** | Claude Sonnet generates win signals, objections, decisions, and a follow-up email draft |
| **OctaMem memory** | Pre-call context from past interactions; post-call memories pushed back |
| **CRM dashboard** | Web UI at `/dashboard/` — contacts, call history, analytics, objection tracking |
| **Prospect detection** | Auto-scrapes participant names from Google Meet, Zoom, Teams |

## Architecture

```
Chrome Extension (WXT 0.19)
  content.tsx      — shadow DOM overlay (React HUD)
  background.ts    — tab capture, MediaRecorder, WebSocket client
  popup/           — prospect setup + post-call view

Fastify Server
  /ws              — WebSocket: audio → Deepgram STT → Claude nudges → client
  /api/*           — REST: contacts CRUD, call history, analytics
  /dashboard/      — SPA served via @fastify/static

SQLite (Drizzle ORM)
  contacts, call_sessions, transcript_lines, signal_frames, call_summaries

packages/types    — shared TypeScript types (Prospect, SignalFrame, ServerMessage…)
```

## Quick Start

### Prerequisites

- Node.js ≥ 20
- pnpm (`npm i -g pnpm`)
- Chrome (for the extension)
- API keys: [Anthropic](https://console.anthropic.com) + [Deepgram](https://console.deepgram.com)
- Optional: [OctaMem](https://octamem.com) for persistent memory

### 1. Install

```bash
git clone https://github.com/Alnoorcapital/signal.git
cd signal
pnpm install
```

### 2. Configure

```bash
cp .env.example apps/server/.env
# Edit apps/server/.env — fill in ANTHROPIC_API_KEY and DEEPGRAM_API_KEY at minimum
```

### 3. Run the server

```bash
pnpm dev:server
# Server → http://localhost:8080
# Dashboard → http://localhost:8080/dashboard/
# WebSocket → ws://localhost:8080/ws
```

### 4. Load the extension

```bash
pnpm dev:ext   # or: pnpm build && load .output/chrome-mv3 as unpacked
```

In Chrome: `chrome://extensions` → **Developer mode** → **Load unpacked** → select `apps/extension/.output/chrome-mv3`.

### 5. Start a call

1. Open Google Meet, Zoom, or Teams.
2. Click the SIGNAL extension icon → set the prospect name → click **Start Call**.
3. The HUD appears. Talk. Watch the nudges.

## Deployment (Fly.io)

```bash
# First time
fly auth login
fly apps create signal-server
fly volumes create signal_data --region lhr --size 1

# Deploy
fly deploy
fly secrets set \
  ANTHROPIC_API_KEY=sk-ant-... \
  DEEPGRAM_API_KEY=... \
  OCTAMEM_API_KEY=... \
  DATABASE_URL=/data/signal.db
```

Point the extension at your deployed server: set `WS_URL=wss://signal-server.fly.dev` in `apps/extension/.env` before building.

## Development

```bash
pnpm typecheck   # TypeScript across all packages
pnpm lint        # ESLint (flat config, TypeScript + React rules)
pnpm format      # Prettier
pnpm test        # Vitest

# End-to-end smoke test (no real API keys needed)
node scripts/e2e-smoke.ts

# Overlay dev harness (no extension needed)
pnpm dev:ext     # then open http://localhost:3000/harness.html
```

## Environment Variables

See [`.env.example`](.env.example) for the full list.

| Variable | Required | Default | Description |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | Yes* | — | Claude API key |
| `DEEPGRAM_API_KEY` | Yes | — | Deepgram STT key |
| `OCTAMEM_API_KEY` | No | — | OctaMem memory key |
| `AI_PROVIDER` | No | `claude` | `claude` or `openrouter` |
| `DATABASE_URL` | No | `./signal.db` | SQLite file path |
| `PORT` | No | `8080` | Server port |

\* Or `OPENROUTER_API_KEY` if `AI_PROVIDER=openrouter`

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
