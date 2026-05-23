# SIGNAL

Real-time AI sales coach running live in your browser calls. SIGNAL listens to your calls, infers speech and optional face-emotion signals, and surfaces nudges, danger warnings, and closing prompts — all inside a floating glass HUD.

**Self-hosted and single-user by default. Call data is stored in your SQLite database. Data leaves your machine only for providers you configure: Deepgram for STT, Claude/OpenRouter/Together for AI, and optional Hume, Voyage, OctaMem, Slack, HubSpot, Google, Outlook, or Gmail integrations.**

---

## What it does

| Feature                | Details                                                                                                                           |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Live nudges**        | The configured AI model analyses transcript every ~12s and fires `ASK`, `REFRAME`, `WARN`, `CLOSE`, or `SILENCE` cues             |
| **Danger detection**   | Sentiment drop, objection keywords, and silence → DANGER state with red pulse                                                     |
| **On-call HUD**        | Top-centre nudge card + right-edge sidebar (sentiment ring, speech signals, optional face emotions, cue history, transcript tail) |
| **Post-call summary**  | The configured summary model generates win signals, objections, decisions, and a follow-up email draft                            |
| **OctaMem memory**     | Pre-call context from past interactions; post-call memories pushed back                                                           |
| **CRM dashboard**      | Web UI at `/dashboard/` — contacts, call history, analytics, objection tracking                                                   |
| **Prospect detection** | Auto-scrapes participant names from Google Meet, Zoom, Teams                                                                      |

## Architecture

```
Chrome Extension (WXT 0.19)
  content.tsx      — shadow DOM overlay (React HUD)
  background.ts    — tab capture, MediaRecorder, WebSocket client
  popup/           — prospect setup + post-call view

Fastify Server
  /ws              — WebSocket: audio → Deepgram STT → AI nudges → client
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
- API keys: one AI provider ([Anthropic](https://console.anthropic.com), OpenRouter, or Together AI) + [Deepgram](https://console.deepgram.com)
- Optional: [OctaMem](https://octamem.com) for persistent memory

### 1. Install

```bash
git clone https://github.com/moayobai/signal.git
cd signal
pnpm install
```

### 2. Configure

```bash
cp .env.example apps/server/.env
# Edit apps/server/.env — set SIGNAL_AUTH_TOKEN, then fill in provider keys.
# Generate a token with: openssl rand -base64 32
```

### 3. Run the server

```bash
pnpm dev:server
# Server → http://localhost:8080
# Dashboard → http://localhost:8080/dashboard/?token=$SIGNAL_AUTH_TOKEN
# WebSocket auth uses the extension's `signal-token.<base64url token>` subprotocol.
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
  SIGNAL_AUTH_TOKEN="$(openssl rand -base64 32)" \
  ANTHROPIC_API_KEY=sk-ant-... \
  DEEPGRAM_API_KEY=... \
  OCTAMEM_API_KEY=... \
  DATABASE_URL=/data/signal.db
```

Point the extension at your deployed server from the popup **Connection** panel. Packaged builds can still set `WS_URL=wss://signal-server.fly.dev` as a default, but the server URL and auth token are stored at runtime so token rotation does not require rebuilding the extension.

## Development

```bash
pnpm typecheck   # TypeScript across all packages
pnpm lint        # ESLint (flat config, TypeScript + React rules)
pnpm format      # Prettier
pnpm test        # Vitest

# End-to-end smoke test (no real API keys needed)
pnpm e2e:smoke

# Browser end-to-end test for dashboard auth + WebSocket lifecycle
pnpm e2e:browser

# Overlay dev harness (no extension needed)
pnpm dev:ext     # then open http://localhost:3000/harness.html
```

## Environment Variables

See [`.env.example`](.env.example) for the full list.

| Variable                             | Required | Default            | Description                                                                  |
| ------------------------------------ | -------- | ------------------ | ---------------------------------------------------------------------------- |
| `ANTHROPIC_API_KEY`                  | Yes\*    | —                  | Claude API key                                                               |
| `OPENROUTER_API_KEY`                 | Yes\*    | —                  | OpenRouter API key                                                           |
| `TOGETHER_API_KEY`                   | Yes\*    | —                  | Together AI API key                                                          |
| `TOGETHER_BASE_URL`                  | No       | Together API URL   | Override for Together-compatible chat-completions endpoint                   |
| `DEEPGRAM_API_KEY`                   | Yes      | —                  | Deepgram STT key                                                             |
| `OCTAMEM_API_KEY`                    | No       | —                  | OctaMem memory key                                                           |
| `AI_PROVIDER`                        | No       | `claude`           | `claude`, `openrouter`, or `together`                                        |
| `DATABASE_URL`                       | No       | `./signal.db`      | SQLite file path                                                             |
| `PORT`                               | No       | `8080`             | Server port                                                                  |
| `SIGNAL_AUTH_TOKEN`                  | Yes      | —                  | Bearer token required for dashboard, API, and WebSocket access               |
| `SIGNAL_AUTH_DISABLED`               | No       | `false`            | Set to `true` only for local tests/dev without auth                          |
| `SIGNAL_RATE_LIMIT_MAX`              | No       | `120`              | Max requests per rate-limit window                                           |
| `SIGNAL_RATE_LIMIT_WINDOW`           | No       | `1 minute`         | Rate-limit window                                                            |
| `SIGNAL_BODY_LIMIT_BYTES`            | No       | `1048576`          | Max HTTP request body size                                                   |
| `SIGNAL_WS_MAX_MESSAGE_BYTES`        | No       | `1048576`          | Max WebSocket message size before close code `1009`                          |
| `SIGNAL_DB_BACKUP_DIR`               | No       | `<db dir>/backups` | Directory for automatic backups before pending migrations                    |
| `SIGNAL_DB_BACKUP_BEFORE_MIGRATIONS` | No       | `true`             | Set to `false` only if an external backup system handles migration snapshots |

\* Use `ANTHROPIC_API_KEY` for `AI_PROVIDER=claude`, `OPENROUTER_API_KEY` for `openrouter`, or `TOGETHER_API_KEY` for `together`.

## Privacy

SIGNAL stores contacts, call metadata, transcripts, AI nudges, summaries, scorecards, calendar detections, and optional semantic-search embeddings in the configured SQLite database. Audio and video frames are streamed only while capture is active. Audio is sent to Deepgram when STT is configured. Transcript text is sent to the configured AI provider for live nudges and post-call summaries. Video frames are sent to Hume only when `HUME_API_KEY` is configured. Sent-mail samples are fetched from Gmail and/or Outlook only when those OAuth credentials are configured. Optional integrations may send selected call data to Voyage, OctaMem, Slack, and HubSpot. Query-string auth tokens are accepted only for dashboard login redirects and are scrubbed into an HttpOnly cookie.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
