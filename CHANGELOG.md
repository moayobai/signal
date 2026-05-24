# Changelog

All notable changes to SIGNAL are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [0.5.0] - 2026-04-29

### Added

- Runtime extension Connection panel for server URL and auth token rotation without rebuilding
- Browser e2e suite for dashboard auth, token-cookie login, and WebSocket start/stop persistence
- Dependabot configuration for npm and GitHub Actions updates
- SQLite backup-before-migration support for file-backed databases

### Changed

- Server hardening now includes Helmet security headers, body limits, WebSocket payload limits, secure production auth cookies, and dashboard token URL scrubbing
- CI now runs browser e2e tests in addition to build, typecheck, lint, unit tests, and production dependency audit
- Documentation now reflects required auth, tracked migrations, backup behavior, and current repository URLs

### Fixed

- Extension stop/reconnect behavior now uses saved runtime connection settings consistently across retries

---

## [0.4.0] — 2026-04-15

### Added

- **Post-call summary** — Claude Sonnet generates win signals, objections, decisions, and follow-up draft at call end
- **OctaMem integration** — pre-call context pulled before each session; post-call memory pushed on completion
- **SQLite persistence** via Drizzle ORM + better-sqlite3 (5 tables: contacts, call_sessions, transcript_lines, signal_frames, call_summaries)
- **Provider-agnostic AI layer** — `ClaudeProvider`, `OpenRouterProvider`, `NoOpProvider`; switch via `AI_PROVIDER` env var
- **Extension popup** — prospect detection UI, pre-call setup (call type, manual prospect entry), post-call summary view with OctaMem panel
- **Web dashboard** — Vite + React SPA served at `/dashboard/`; 4 pages: Home (analytics), Contacts (CRM), Contact Detail, Call Detail
- **On-call HUD redesign** — top-centre `NudgeCard` (slides in, auto-dims after 8s, DANGER pulse) + right-edge `LiveSidebar` (sentiment ring, body language, cue history, transcript tail)
- macOS glass aesthetic throughout (backdrop-filter, gradient mesh, SVG grain, Fraunces/Geist/JetBrains Mono type stack)

### Fixed

- WebSocket `onStop` promise latch prevents double-invocation race
- `sentimentAvg` stores `null` (not `0`) for calls with no sentiment data
- `upsertContact` correctly uses `isNull()` guard to prevent merging unrelated contacts

### Infrastructure

- ESLint + Prettier configured at monorepo root
- GitHub Actions CI workflow (typecheck → lint → test)
- `fly.toml` with persistent volume mount for SQLite
- MIT License, CONTRIBUTING.md, SECURITY.md

---

## [0.3.0] — 2026-04-10

### Added

- Real-time transcript streaming via Deepgram
- Claude Haiku live nudges (12-second cadence)
- Chrome MV3 extension with content-script shadow DOM overlay
- WebSocket server (Fastify + @fastify/websocket)
- Danger state detection (sentiment threshold)

---

## [0.2.0] — 2026-04-07

### Added

- WXT extension scaffold
- Basic overlay HUD (pill → LIVE → POSTCALL states)
- Zustand store

---

## [0.1.0] — 2026-04-01

### Added

- Turborepo monorepo setup
- `packages/types` shared type definitions
- Initial Fastify server skeleton
