# SIGNAL — Phase 1 Design Doc
**Date:** 2026-04-14  
**Scope:** Monorepo scaffold + Chrome extension overlay UI (mock data only)  
**Goal:** Loadable, demoable Chrome extension with all 4 overlay states, full Apple Glass design system, pixel-perfect animations. No real API calls.

---

## Decisions

| Decision | Choice | Reason |
|---|---|---|
| Package manager | pnpm (via corepack) | Spec requirement. Fast, workspace-native. |
| Monorepo tool | Turborepo | Spec requirement. Pipeline caching for build/dev. |
| Extension framework | WXT | Best MV3 + Vite DX. Built-in HMR in Chrome. Thin abstraction. |
| UI framework | React 18 + TypeScript | Spec requirement. |
| Styling | Tailwind + CSS custom properties | Tailwind for utilities; tokens.css as the source of truth for design values. |
| State | Zustand | Spec requirement. Minimal boilerplate. |
| Dev harness | WXT entrypoint (`entrypoints/harness/`) | Same Vite config and components. No duplication. Full hot reload. |
| Animation | CSS only (`@keyframes` + transitions) | No animation library. Spec values exactly. |

---

## Monorepo Structure

```
signal/
├── apps/
│   ├── extension/               # WXT Chrome extension (MV3)
│   │   ├── entrypoints/
│   │   │   ├── background.ts    # service worker
│   │   │   ├── content.ts       # DOM injection trigger
│   │   │   └── harness/         # dev harness (localhost page)
│   │   │       ├── index.html
│   │   │       └── main.tsx
│   │   ├── components/
│   │   │   ├── GlassPanel.tsx
│   │   │   ├── PromptCard.tsx
│   │   │   ├── SentimentArc.tsx
│   │   │   ├── BodyLangRead.tsx
│   │   │   └── TranscriptFeed.tsx
│   │   ├── overlay/
│   │   │   ├── Overlay.tsx      # root overlay component, state → view
│   │   │   └── store.ts         # Zustand store (SignalFrame + overlayState)
│   │   ├── mock/
│   │   │   └── fixture.ts       # mock state machine, emits SignalFrame on timer
│   │   └── wxt.config.ts
│   └── server/                  # Fastify backend (stubbed — Phase 2)
│       └── src/index.ts
├── packages/
│   ├── tokens/
│   │   ├── tokens.css           # CSS custom properties (single source of truth)
│   │   └── package.json         # name: @signal/tokens
│   └── types/
│       ├── index.ts             # PromptType, SignalFrame, BodyLangRead, CallSession, etc.
│       └── package.json         # name: @signal/types
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

---

## Design Tokens (`packages/tokens/tokens.css`)

```css
:root {
  /* Glass surfaces */
  --glass-bg:       rgba(255, 255, 255, 0.72);
  --glass-border:   rgba(255, 255, 255, 0.55);
  --glass-blur:     blur(32px) saturate(180%);
  --glass-shadow:   0 20px 60px rgba(0,0,0,0.10), 0 0 0 0.5px rgba(0,0,0,0.05);

  /* Brand */
  --accent:         #0071E3;
  --accent-subtle:  rgba(0, 113, 227, 0.10);

  /* Semantic */
  --success:        #30d158;
  --warning:        #ff9f0a;
  --danger:         #ff453a;

  /* Text */
  --text-primary:   #1d1d1f;
  --text-secondary: #6e6e73;
  --text-tertiary:  #aeaeb2;

  /* Radii */
  --radius-pill:    100px;
  --radius-lg:      18px;
  --radius-md:      12px;
  --radius-sm:      8px;

  /* Typography */
  --font-body:      -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Inter', sans-serif;
  --font-mono:      'SF Mono', 'Fira Code', monospace;
}
```

---

## Shared Types (`packages/types/index.ts`)

```ts
export type PromptType = 'ASK' | 'CLOSE' | 'WARN' | 'REFRAME' | 'BODY' | 'SILENCE' | 'IDLE';
export type OverlayState = 'IDLE' | 'LIVE' | 'DANGER' | 'POSTCALL';

export interface SignalPrompt {
  type: PromptType;
  text: string;
  confidence: number;
  isNudge: boolean;
  timestamp: number;
}

export interface BodyLangRead {
  eyeContact: 'strong' | 'direct' | 'moderate' | 'avoidant';
  posture: 'forward' | 'neutral' | 'leaning back' | 'arms crossed';
  microExpressions: 'engaged' | 'nodding' | 'thinking' | 'confused' | 'sceptical';
}

export interface SignalFrame {
  prompt: SignalPrompt;
  bodyLang: BodyLangRead;
  sentiment: number;       // 0–100
  dangerFlag: boolean;
  dangerReason: string | null;
}

export interface TranscriptLine {
  speaker: 'user' | 'prospect';
  text: string;
  timestamp: number;
}

export interface CallSession {
  id: string;
  platform: 'meet' | 'zoom' | 'teams';
  type: 'investor' | 'enterprise' | 'bd' | 'customer';
  prospect: { name: string; company: string; role: string };
  startedAt: number;
  transcript: TranscriptLine[];
}
```

---

## Components

### GlassPanel
Base container. All overlay surfaces extend this.

- `variant: 'pill' | 'panel'` — controls border-radius and width
- `danger?: boolean` — activates amber border pulse
- `backdrop-filter: blur(32px) saturate(180%)`
- Transition between pill↔panel: `380ms cubic-bezier(0.34, 1.56, 0.64, 1)` on `width`, `height`, `border-radius`

### PromptCard
Core output unit. Pinned to bottom of panel.

- Props: `type`, `text`, `confidence`, `isNudge`, `onDismiss`
- On `text` change: fade out `140ms` → update → fade in `140ms` + `translateY(6px → 0)` `280ms ease-out`
- `isNudge=true`: amber border pulse `180ms ease-in-out`, `scale(1.01)`
- Swipe right to dismiss (touch + mouse drag)

### SentimentArc
3px progress bar, full panel width.

- CSS `transition: width 1200ms ease`
- Colour: `--success` above 65, `--warning` 40–65, `--danger` below 40
- Hover reveals sparkline of last 10 values (SVG, inline)

### BodyLangRead
Three signal rows: eye contact · posture · micro-expressions.

- Refreshes with a fade transition when values change
- Badge colour mapping per spec:
  - `strong/direct` → green, `moderate` → amber, `avoidant` → red
  - `forward/neutral` → green, `leaning back/arms crossed` → amber
  - `engaged/nodding` → green, `thinking` → neutral, `confused/sceptical` → amber/red

### TranscriptFeed
Scrollable feed, max 4 lines visible.

- New lines: `opacity 0 → 1` + `translateY(4px → 0)` `320ms ease-out`
- Speaker label in accent blue (prospect) or tertiary (user)
- Auto-scrolls to latest line

---

## Overlay States

### IDLE
`GlassPanel[variant=pill]` — 44px height, ~180px wide, bottom-right corner.
Content: coloured status dot + "SIGNAL · MM:SS" elapsed timer.
Dot colours: green (nominal), amber (nudge ready), red (off track).

### LIVE
`GlassPanel[variant=panel]` — 280px wide, ~480px tall.
Stack: header (SIGNAL logo + LIVE pill + timer) → SentimentArc → BodyLangRead → TranscriptFeed → PromptCard.

### DANGER
LIVE state + `danger=true` on GlassPanel → amber border pulse.
PromptCard flips to WARN/BODY type. Fires on: 30s silence, pricing objection, competitor mention, disengagement body lang.

### POSTCALL
GlassPanel[variant=panel] expands.
Content: win/loss indicators, key objections list, decisions made, follow-up action items.
Three status rows: "Transcript saved to Granola" / "3 decisions stored to OctaMem" / "Follow-up draft queued".

---

## Mock Fixture (`mock/fixture.ts`)

Auto-cycling state machine. Emits `SignalFrame` objects on a timer matching real WebSocket shape.

```
t=0s   → overlayState: IDLE,    dot: green,  timer running
t=3s   → overlayState: LIVE,    sentiment: 74, transcript lines begin appearing
t=8s   → new prompt: REFRAME — "Lead with accountability, not accuracy..."
t=15s  → overlayState: DANGER,  dangerFlag: true, dangerReason: "leaning back"
t=22s  → overlayState: LIVE,    recovers, prompt: ASK
t=40s  → overlayState: POSTCALL, summary panel
t=48s  → resets to IDLE (loop)
```

---

## Dev Harness (`entrypoints/harness/`)

Full-screen page simulating a Meet call behind the overlay:
- Dark blurred background (mimics video call backdrop)
- Overlay rendered bottom-right, auto-cycling fixture by default
- Control strip (top): IDLE / LIVE / DANGER / POSTCALL buttons + auto-cycle toggle + sentiment scrubber
- Runs on `localhost:3000` via `pnpm dev`

---

## Motion System

| Event | Duration | Easing | Property |
|---|---|---|---|
| Pill → Panel | 380ms | cubic-bezier(0.34, 1.56, 0.64, 1) | width, height, border-radius |
| Prompt update | 280ms | ease-out | opacity, translateY |
| Body lang nudge | 180ms | ease-in-out | border pulse, scale(1.01) |
| Sentiment bar | 1200ms | ease | width |
| Transcript line in | 320ms | ease-out | opacity, translateY |
| Danger alert | 200ms | ease-in | border-color, background |

---

## Dev Commands

```bash
pnpm install          # install all workspace deps
pnpm dev              # harness on localhost:3000 (hot reload)
pnpm dev:ext          # WXT dev mode — extension loaded in Chrome
pnpm build            # production extension zip
pnpm typecheck        # tsc --noEmit across all packages
pnpm lint             # ESLint across all packages
```

---

## Phase 1 Success Criteria

1. `pnpm dev` serves harness on localhost:3000
2. All 4 overlay states render correctly with Apple Glass surfaces
3. Auto-cycle runs the full scenario (IDLE → LIVE → DANGER → LIVE → POSTCALL → loop)
4. Manual state buttons in harness switch states instantly
5. All animations match spec timings (verify with DevTools)
6. `pnpm dev:ext` loads the extension in Chrome
7. Overlay appears on `meet.google.com` bottom-right, cycling mock states
8. `pnpm typecheck` passes with zero errors
9. `pnpm build` produces a valid extension zip
