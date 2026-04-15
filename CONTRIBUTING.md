# Contributing to SIGNAL

Thanks for your interest in contributing. SIGNAL is a self-hosted, single-user tool — contributions should stay focused on correctness, simplicity, and performance. YAGNI applies.

## Getting Started

```bash
git clone https://github.com/Alnoorcapital/signal.git
cd signal
pnpm install
cp .env.example apps/server/.env
```

### Run locally

```bash
# Server (http://localhost:8080, ws://localhost:8080/ws, /dashboard/)
pnpm dev:server

# Extension (WXT dev server + Chrome hot reload)
pnpm dev:ext
```

Load the extension in Chrome: `chrome://extensions` → **Load unpacked** → `apps/extension/.output/chrome-mv3`.

## Project Structure

```
apps/
  extension/          # Chrome MV3 extension (WXT 0.19)
    entrypoints/      # content.tsx, background.ts, popup/, harness/
    overlay/          # React HUD components + Zustand store
    mock/             # Fixture for dev harness
  server/             # Fastify server
    src/
      routes/         # ws.ts (WebSocket), api.ts (REST)
      services/       # ai.ts, db.ts, octamem.ts, summary.ts, deepgram.ts
    dashboard/        # Vite + React SPA (builds to public/)
packages/
  types/              # Shared TypeScript types
  tokens/             # Design tokens
```

## Code Style

- TypeScript everywhere. No `any` unless unavoidable.
- Follow existing patterns — don't introduce new abstractions for one-off code.
- Run `pnpm format` before committing (Prettier).
- Run `pnpm lint` — all warnings should be addressed, errors are blocking.

## Testing

```bash
pnpm test               # all packages
pnpm typecheck          # TypeScript across the monorepo
node scripts/e2e-smoke.ts  # end-to-end smoke test (no real API keys needed)
```

## Submitting a Pull Request

1. Branch from `main` — name it `feat/`, `fix/`, or `chore/` as appropriate.
2. Keep PRs focused — one concern per PR.
3. Include a description of _why_, not just _what_.
4. Ensure `pnpm typecheck`, `pnpm lint`, and `pnpm test` all pass.

## Architecture Decisions

Key constraints that guide the design:

| Constraint | Reason |
|---|---|
| Monolith expansion (all server features in `apps/server`) | Simpler self-hosting |
| SQLite via Drizzle ORM | Zero-dependency, single-file DB on Fly.io volume |
| No auth | Self-hosted single-user by design |
| `CREATE TABLE IF NOT EXISTS` DDL (no migrations) | YAGNI — single user, schema is stable |
| `NoOpProvider` for missing keys | Graceful degradation over hard startup failures |

If you're proposing a change that touches one of these constraints, explain why in the PR description.

## Reporting Issues

Open a [GitHub Issue](https://github.com/Alnoorcapital/signal/issues). Include:
- Steps to reproduce
- Expected vs actual behaviour
- Server logs (redact API keys)
- Chrome/OS version if it's an extension issue

## Security

See [SECURITY.md](SECURITY.md) for the vulnerability disclosure process.
