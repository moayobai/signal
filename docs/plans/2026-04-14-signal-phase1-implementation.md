# SIGNAL Phase 1 — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Scaffold a Turborepo monorepo containing a WXT Chrome extension (MV3) with a full Apple Glass overlay UI across all 4 states, wired to a mock fixture — loadable in Chrome and hot-reloading in a dev harness at localhost:3000.

**Architecture:** Turborepo monorepo with two shared packages (`@signal/types`, `@signal/tokens`) consumed by the WXT extension app. The overlay renders into a shadow DOM injected by a content script. A harness HTML entrypoint serves the overlay in a browser page for fast iteration.

**Tech Stack:** pnpm · Turborepo v2 · WXT v0.19 · React 18 · TypeScript 5 · Tailwind v4 · Zustand v5 · Vitest

---

## Working directory

All commands run from: `/Users/mahomedayob/SIGNAL BUILD`

---

## Task 1: Toolchain + monorepo root

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Create: `.gitignore`

**Step 1: Enable pnpm via corepack**

```bash
corepack enable
corepack prepare pnpm@latest --activate
pnpm --version
```
Expected: prints pnpm version (9.x or 10.x)

**Step 2: Create root `package.json`**

```json
{
  "name": "signal",
  "private": true,
  "scripts": {
    "dev": "turbo run dev --filter=extension",
    "dev:ext": "turbo run dev:ext --filter=extension",
    "build": "turbo run build",
    "typecheck": "turbo run typecheck",
    "lint": "turbo run lint",
    "test": "turbo run test"
  },
  "devDependencies": {
    "turbo": "^2.0.0"
  },
  "engines": {
    "node": ">=20"
  }
}
```

**Step 3: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

**Step 4: Create `turbo.json`**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "ui": "tui",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".wxt/**", ".output/**"]
    },
    "dev": {
      "persistent": true,
      "cache": false
    },
    "dev:ext": {
      "persistent": true,
      "cache": false
    },
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "test": {
      "dependsOn": ["^build"]
    },
    "lint": {}
  }
}
```

**Step 5: Create `.gitignore`**

```
node_modules/
dist/
.output/
.wxt/
*.zip
.env
.env.local
.turbo/
```

**Step 6: Install root deps**

```bash
pnpm install
```
Expected: `node_modules/.pnpm` created, `pnpm-lock.yaml` generated

**Step 7: Commit**

```bash
git add package.json pnpm-workspace.yaml turbo.json .gitignore pnpm-lock.yaml
git commit -m "chore: init Turborepo monorepo root with pnpm"
```

---

## Task 2: `@signal/types` package

**Files:**
- Create: `packages/types/package.json`
- Create: `packages/types/tsconfig.json`
- Create: `packages/types/index.ts`

**Step 1: Create directory + `package.json`**

```bash
mkdir -p packages/types
```

```json
{
  "name": "@signal/types",
  "version": "0.1.0",
  "private": true,
  "main": "./index.ts",
  "types": "./index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.5.0"
  }
}
```

**Step 2: Create `packages/types/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true
  },
  "include": ["index.ts"]
}
```

**Step 3: Create `packages/types/index.ts`**

```ts
export type PromptType =
  | 'ASK'
  | 'CLOSE'
  | 'WARN'
  | 'REFRAME'
  | 'BODY'
  | 'SILENCE'
  | 'IDLE';

export type OverlayState = 'IDLE' | 'LIVE' | 'DANGER' | 'POSTCALL';

export interface SignalPrompt {
  type: PromptType;
  text: string;
  confidence: number; // 0–1
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
  sentiment: number; // 0–100
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

export interface PostCallSummary {
  winSignals: string[];
  objections: string[];
  decisions: string[];
  followUpDraft: string;
}
```

**Step 4: Install deps + verify typecheck**

```bash
pnpm install
pnpm --filter @signal/types typecheck
```
Expected: exits 0, no errors

**Step 5: Commit**

```bash
git add packages/types/
git commit -m "feat: add @signal/types shared TypeScript package"
```

---

## Task 3: `@signal/tokens` package

**Files:**
- Create: `packages/tokens/package.json`
- Create: `packages/tokens/tokens.css`

**Step 1: Create directory + `package.json`**

```bash
mkdir -p packages/tokens
```

```json
{
  "name": "@signal/tokens",
  "version": "0.1.0",
  "private": true,
  "exports": {
    "./tokens.css": "./tokens.css"
  }
}
```

**Step 2: Create `packages/tokens/tokens.css`**

```css
:root {
  /* Glass surfaces */
  --glass-bg:       rgba(255, 255, 255, 0.72);
  --glass-border:   rgba(255, 255, 255, 0.55);
  --glass-shadow:   0 20px 60px rgba(0, 0, 0, 0.10), 0 0 0 0.5px rgba(0, 0, 0, 0.05);

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

  /* Motion */
  --ease-spring:    cubic-bezier(0.34, 1.56, 0.64, 1);
  --ease-out:       ease-out;
  --ease-in:        ease-in;
}
```

**Step 3: Commit**

```bash
git add packages/tokens/
git commit -m "feat: add @signal/tokens CSS custom properties package"
```

---

## Task 4: WXT extension scaffold

**Files:**
- Create: `apps/extension/package.json`
- Create: `apps/extension/tsconfig.json`
- Create: `apps/extension/wxt.config.ts`
- Create: `apps/extension/entrypoints/background.ts`

**Step 1: Create directory structure**

```bash
mkdir -p apps/extension/entrypoints
mkdir -p apps/extension/components
mkdir -p apps/extension/overlay
mkdir -p apps/extension/mock
mkdir -p apps/extension/assets/styles
mkdir -p apps/server/src
```

**Step 2: Create `apps/extension/package.json`**

```json
{
  "name": "extension",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wxt dev --entrypoints harness",
    "dev:ext": "wxt dev",
    "build": "wxt build",
    "typecheck": "wxt prepare && tsc --noEmit",
    "lint": "eslint src --ext .ts,.tsx"
  },
  "dependencies": {
    "@signal/tokens": "workspace:*",
    "@signal/types": "workspace:*",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "zustand": "^5.0.0"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.0.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0",
    "wxt": "^0.19.0"
  }
}
```

**Step 3: Create `apps/extension/tsconfig.json`**

```json
{
  "extends": "./.wxt/tsconfig.json",
  "compilerOptions": {
    "strict": true,
    "jsx": "react-jsx",
    "paths": {
      "@signal/types": ["../../packages/types/index.ts"],
      "@signal/tokens/*": ["../../packages/tokens/*"]
    }
  }
}
```

**Step 4: Create `apps/extension/wxt.config.ts`**

```ts
import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  srcDir: '.',
  manifest: {
    name: 'SIGNAL',
    description: 'Real-time AI co-pilot for sales & investor calls',
    version: '0.1.0',
    permissions: ['tabs', 'storage'],
    host_permissions: [
      '*://meet.google.com/*',
      '*://*.zoom.us/*',
      '*://teams.microsoft.com/*',
    ],
  },
  vite: () => ({
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        '@signal/types': '../../packages/types/index.ts',
      },
    },
  }),
});
```

**Step 5: Create `apps/extension/entrypoints/background.ts`**

```ts
export default defineBackground(() => {
  console.log('[SIGNAL] background service worker started');
});
```

**Step 6: Create `apps/extension/assets/styles/globals.css`**

```css
@import "tailwindcss";
@import "@signal/tokens/tokens.css";

@theme {
  --color-accent: var(--accent);
  --color-success: var(--success);
  --color-warning: var(--warning);
  --color-danger: var(--danger);
  --color-text-primary: var(--text-primary);
  --color-text-secondary: var(--text-secondary);
  --color-text-tertiary: var(--text-tertiary);
  --radius-pill: var(--radius-pill);
  --radius-lg: var(--radius-lg);
  --radius-md: var(--radius-md);
  --radius-sm: var(--radius-sm);
  --font-body: var(--font-body);
  --font-mono: var(--font-mono);
}

/* Motion keyframes */
@keyframes border-pulse {
  0%, 100% { border-color: rgba(255, 159, 10, 0.4); }
  50%       { border-color: rgba(255, 159, 10, 0.9); }
}

@keyframes slide-up {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}

@keyframes fade-in {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

**Step 7: Install all workspace deps**

```bash
pnpm install
```
Expected: all packages resolved, lockfile updated

**Step 8: Run WXT prepare to generate types**

```bash
cd apps/extension && pnpm exec wxt prepare
```
Expected: `.wxt/` directory created with generated tsconfig + types

**Step 9: Typecheck**

```bash
pnpm --filter extension typecheck
```
Expected: 0 errors (only background.ts exists so far)

**Step 10: Commit**

```bash
git add apps/extension/ apps/server/
git commit -m "feat: scaffold WXT extension app and server stub"
```

---

## Task 5: Server stub

**Files:**
- Create: `apps/server/package.json`
- Create: `apps/server/src/index.ts`

**Step 1: Create `apps/server/package.json`**

```json
{
  "name": "server",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "echo 'server not yet implemented'",
    "build": "echo 'server not yet implemented'",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.5.0"
  }
}
```

**Step 2: Create `apps/server/src/index.ts`**

```ts
// Phase 2: Fastify backend
// WebSocket handler, Deepgram STT, Claude integration
// TODO: implement in Phase 2
export {};
```

**Step 3: Commit**

```bash
git add apps/server/
git commit -m "chore: add server stub (Phase 2 placeholder)"
```

---

## Task 6: `GlassPanel` component

**Files:**
- Create: `apps/extension/components/GlassPanel.tsx`

**Step 1: Create `GlassPanel.tsx`**

This is the base surface. Every overlay panel extends it. The pill↔panel morph animation is the core interaction.

```tsx
import type { ReactNode } from 'react';

type GlassPanelVariant = 'pill' | 'panel';

interface GlassPanelProps {
  variant: GlassPanelVariant;
  danger?: boolean;
  children: ReactNode;
  className?: string;
}

export function GlassPanel({
  variant,
  danger = false,
  children,
  className = '',
}: GlassPanelProps) {
  const base = [
    'relative overflow-hidden',
    // Glass surface
    'bg-white/[0.72]',
    'border border-white/[0.55]',
    // backdrop blur applied via inline style for shadow DOM compatibility
    'shadow-[0_20px_60px_rgba(0,0,0,0.10),0_0_0_0.5px_rgba(0,0,0,0.05)]',
    // Smooth morph transition
    'transition-[width,height,border-radius] duration-[380ms]',
    'ease-[cubic-bezier(0.34,1.56,0.64,1)]',
  ].join(' ');

  const variants: Record<GlassPanelVariant, string> = {
    pill: 'rounded-[100px] h-[44px] w-[180px] flex items-center px-4',
    panel: 'rounded-[20px] w-[280px]',
  };

  const dangerStyles = danger
    ? 'border-[1.5px] border-warning/40 animate-[border-pulse_1.2s_ease-in-out_infinite]'
    : '';

  return (
    <div
      className={`${base} ${variants[variant]} ${dangerStyles} ${className}`}
      style={{ backdropFilter: 'blur(32px) saturate(180%)' }}
    >
      {children}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add apps/extension/components/GlassPanel.tsx
git commit -m "feat: add GlassPanel base component"
```

---

## Task 7: `SentimentArc` component

**Files:**
- Create: `apps/extension/components/SentimentArc.tsx`

**Step 1: Create `SentimentArc.tsx`**

```tsx
interface SentimentArcProps {
  value: number; // 0–100
  history?: number[];
}

function sentimentColor(value: number): string {
  if (value >= 65) return 'var(--success)';
  if (value >= 40) return 'var(--warning)';
  return 'var(--danger)';
}

export function SentimentArc({ value, history = [] }: SentimentArcProps) {
  const color = sentimentColor(value);
  const clampedValue = Math.max(0, Math.min(100, value));

  return (
    <div className="px-4 py-3 border-b border-black/5">
      <div className="text-[9px] font-semibold tracking-[0.1em] uppercase text-[--text-tertiary] mb-2">
        Engagement
      </div>

      {/* Bar */}
      <div className="h-[3px] bg-black/[0.06] rounded-full overflow-hidden mb-1">
        <div
          className="h-full rounded-full transition-[width] duration-[1200ms] ease"
          style={{ width: `${clampedValue}%`, backgroundColor: color }}
        />
      </div>

      {/* Labels */}
      <div className="flex justify-between text-[9px] text-[--text-tertiary]">
        <span>cold</span>
        <span style={{ color }}>{clampedValue}%</span>
        <span>hot</span>
      </div>

      {/* Sparkline on hover — shown if history provided */}
      {history.length > 1 && (
        <svg
          className="w-full mt-2 opacity-0 group-hover:opacity-100 transition-opacity"
          height="20"
          viewBox={`0 0 ${history.length - 1} 20`}
          preserveAspectRatio="none"
        >
          <polyline
            fill="none"
            stroke={color}
            strokeWidth="1.5"
            points={history
              .map((v, i) => `${i},${20 - (v / 100) * 20}`)
              .join(' ')}
          />
        </svg>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add apps/extension/components/SentimentArc.tsx
git commit -m "feat: add SentimentArc component"
```

---

## Task 8: `BodyLangRead` component

**Files:**
- Create: `apps/extension/components/BodyLangRead.tsx`

**Step 1: Create `BodyLangRead.tsx`**

```tsx
import type { BodyLangRead as BodyLangReadType } from '@signal/types';

interface BodyLangReadProps {
  data: BodyLangReadType;
}

type BadgeVariant = 'green' | 'amber' | 'red' | 'neutral';

const eyeContactVariant: Record<BodyLangReadType['eyeContact'], BadgeVariant> = {
  strong: 'green',
  direct: 'green',
  moderate: 'amber',
  avoidant: 'red',
};

const postureVariant: Record<BodyLangReadType['posture'], BadgeVariant> = {
  forward: 'green',
  neutral: 'green',
  'leaning back': 'amber',
  'arms crossed': 'amber',
};

const microVariant: Record<BodyLangReadType['microExpressions'], BadgeVariant> = {
  engaged: 'green',
  nodding: 'green',
  thinking: 'neutral',
  confused: 'amber',
  sceptical: 'red',
};

const badgeStyles: Record<BadgeVariant, string> = {
  green:   'bg-[rgba(48,209,88,0.12)] text-[#1a8c3a]',
  amber:   'bg-[rgba(255,159,10,0.12)] text-[#b06000]',
  red:     'bg-[rgba(255,69,58,0.12)] text-[#c0392b]',
  neutral: 'bg-black/[0.05] text-[--text-secondary]',
};

function Badge({ label, variant }: { label: string; variant: BadgeVariant }) {
  return (
    <span
      className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${badgeStyles[variant]}`}
    >
      {label}
    </span>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center mb-1.5 last:mb-0">
      <span className="text-[11px] text-[--text-secondary]">{label}</span>
      {children}
    </div>
  );
}

export function BodyLangRead({ data }: BodyLangReadProps) {
  return (
    <div className="px-4 py-3 border-b border-black/5">
      <div className="text-[9px] font-semibold tracking-[0.1em] uppercase text-[--text-tertiary] mb-2">
        Body language
      </div>
      <Row label="Eye contact">
        <Badge label={data.eyeContact} variant={eyeContactVariant[data.eyeContact]} />
      </Row>
      <Row label="Posture">
        <Badge label={data.posture} variant={postureVariant[data.posture]} />
      </Row>
      <Row label="Micro-expressions">
        <Badge label={data.microExpressions} variant={microVariant[data.microExpressions]} />
      </Row>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add apps/extension/components/BodyLangRead.tsx
git commit -m "feat: add BodyLangRead component"
```

---

## Task 9: `PromptCard` component

**Files:**
- Create: `apps/extension/components/PromptCard.tsx`

**Step 1: Create `PromptCard.tsx`**

The fade-out/in on prompt change is the key behaviour. We track the previous text and animate between them.

```tsx
import { useEffect, useRef, useState } from 'react';
import type { SignalPrompt } from '@signal/types';

interface PromptCardProps {
  prompt: SignalPrompt;
  onDismiss?: () => void;
}

const typeLabels: Record<SignalPrompt['type'], string> = {
  ASK:     'ASK · ADVANCE',
  CLOSE:   'CLOSE · SIGNAL',
  WARN:    'WARN · DANGER',
  REFRAME: 'REFRAME · POSITION',
  BODY:    'BODY LANG · NUDGE',
  SILENCE: 'SILENCE · RE-ENGAGE',
  IDLE:    'SIGNAL · LISTENING',
};

const typeColors: Record<SignalPrompt['type'], string> = {
  ASK:     'text-[--accent]',
  CLOSE:   'text-[--success]',
  WARN:    'text-[--danger]',
  REFRAME: 'text-[--accent]',
  BODY:    'text-[#b06000]',
  SILENCE: 'text-[--text-tertiary]',
  IDLE:    'text-[--text-tertiary]',
};

export function PromptCard({ prompt, onDismiss }: PromptCardProps) {
  const [visible, setVisible] = useState(true);
  const [displayedPrompt, setDisplayedPrompt] = useState(prompt);
  const prevTimestamp = useRef(prompt.timestamp);

  // Fade out → swap → fade in when prompt changes
  useEffect(() => {
    if (prompt.timestamp === prevTimestamp.current) return;
    prevTimestamp.current = prompt.timestamp;

    setVisible(false);
    const timer = setTimeout(() => {
      setDisplayedPrompt(prompt);
      setVisible(true);
    }, 140);
    return () => clearTimeout(timer);
  }, [prompt]);

  const isNudge = displayedPrompt.isNudge;

  return (
    <div className="px-4 pb-4 pt-3">
      {/* Type label */}
      <div
        className={`text-[9px] font-semibold tracking-[0.1em] uppercase mb-1.5 ${
          typeColors[displayedPrompt.type]
        }`}
        style={{ opacity: 0.6 + displayedPrompt.confidence * 0.4 }}
      >
        {typeLabels[displayedPrompt.type]}
      </div>

      {/* Prompt box */}
      <div
        className={[
          'rounded-[10px] px-3 py-2.5',
          'bg-[--accent-subtle] border border-[rgba(0,113,227,0.18)]',
          'transition-[opacity,transform] duration-[280ms] ease-out',
          isNudge
            ? 'border-[rgba(255,159,10,0.5)] bg-[rgba(255,159,10,0.06)] animate-[border-pulse_1.2s_ease-in-out_infinite]'
            : '',
          visible
            ? 'opacity-100 translate-y-0'
            : 'opacity-0 translate-y-1.5',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <p className="text-[11.5px] text-[--text-primary] leading-[1.55]">
          {displayedPrompt.text}
        </p>
      </div>

      {/* Dismiss hint */}
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="mt-1.5 text-[9px] text-[--text-tertiary] hover:text-[--text-secondary] transition-colors w-full text-right"
        >
          swipe to dismiss →
        </button>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add apps/extension/components/PromptCard.tsx
git commit -m "feat: add PromptCard component with fade transition"
```

---

## Task 10: `TranscriptFeed` component

**Files:**
- Create: `apps/extension/components/TranscriptFeed.tsx`

**Step 1: Create `TranscriptFeed.tsx`**

```tsx
import { useEffect, useRef } from 'react';
import type { TranscriptLine } from '@signal/types';

interface TranscriptFeedProps {
  lines: TranscriptLine[];
  maxVisible?: number;
}

export function TranscriptFeed({ lines, maxVisible = 4 }: TranscriptFeedProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const visibleLines = lines.slice(-maxVisible);

  // Auto-scroll to latest line
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines.length]);

  return (
    <div className="px-4 py-2.5 border-b border-black/5 max-h-[88px] overflow-hidden">
      {visibleLines.map((line, i) => (
        <div
          key={line.timestamp}
          className="animate-[slide-up_320ms_ease-out]"
          style={{ animationFillMode: 'both', animationDelay: `${i * 20}ms` }}
        >
          <div
            className={`text-[9px] font-semibold tracking-[0.06em] uppercase mb-0.5 ${
              line.speaker === 'prospect'
                ? 'text-[--accent]'
                : 'text-[--text-tertiary]'
            }`}
          >
            {line.speaker === 'prospect' ? 'PROSPECT' : 'YOU'}
          </div>
          <p className="text-[11px] text-[--text-secondary] leading-[1.5] mb-1.5">
            {line.text}
          </p>
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add apps/extension/components/TranscriptFeed.tsx
git commit -m "feat: add TranscriptFeed component with slide-up animation"
```

---

## Task 11: Zustand store

**Files:**
- Create: `apps/extension/overlay/store.ts`

**Step 1: Create `store.ts`**

```ts
import { create } from 'zustand';
import type {
  OverlayState,
  SignalFrame,
  TranscriptLine,
  PostCallSummary,
} from '@signal/types';

interface SignalStore {
  // State
  overlayState: OverlayState;
  frame: SignalFrame | null;
  transcript: TranscriptLine[];
  elapsedSeconds: number;
  postCallSummary: PostCallSummary | null;

  // Actions
  setOverlayState: (state: OverlayState) => void;
  setFrame: (frame: SignalFrame) => void;
  appendTranscriptLine: (line: TranscriptLine) => void;
  setElapsedSeconds: (s: number) => void;
  setPostCallSummary: (summary: PostCallSummary) => void;
  reset: () => void;
}

const DEFAULT_FRAME: SignalFrame = {
  prompt: {
    type: 'IDLE',
    text: 'Listening...',
    confidence: 1,
    isNudge: false,
    timestamp: 0,
  },
  bodyLang: {
    eyeContact: 'direct',
    posture: 'neutral',
    microExpressions: 'engaged',
  },
  sentiment: 50,
  dangerFlag: false,
  dangerReason: null,
};

export const useSignalStore = create<SignalStore>((set) => ({
  overlayState: 'IDLE',
  frame: DEFAULT_FRAME,
  transcript: [],
  elapsedSeconds: 0,
  postCallSummary: null,

  setOverlayState: (overlayState) => set({ overlayState }),
  setFrame: (frame) => set({ frame }),
  appendTranscriptLine: (line) =>
    set((s) => ({ transcript: [...s.transcript, line] })),
  setElapsedSeconds: (elapsedSeconds) => set({ elapsedSeconds }),
  setPostCallSummary: (postCallSummary) => set({ postCallSummary }),
  reset: () =>
    set({
      overlayState: 'IDLE',
      frame: DEFAULT_FRAME,
      transcript: [],
      elapsedSeconds: 0,
      postCallSummary: null,
    }),
}));
```

**Step 2: Commit**

```bash
git add apps/extension/overlay/store.ts
git commit -m "feat: add Zustand signal store"
```

---

## Task 12: Mock fixture + unit test

**Files:**
- Create: `apps/extension/mock/fixture.ts`
- Create: `apps/extension/mock/fixture.test.ts`
- Create: `apps/extension/vitest.config.ts`

**Step 1: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
  },
});
```

**Step 2: Write the failing test first**

Create `apps/extension/mock/fixture.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createFixture } from './fixture';

describe('createFixture', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('starts in IDLE state', () => {
    const events: string[] = [];
    const stop = createFixture({
      onOverlayState: (s) => events.push(s),
      onFrame: () => {},
      onTranscriptLine: () => {},
      onPostCallSummary: () => {},
      onElapsed: () => {},
    });
    expect(events[0]).toBe('IDLE');
    stop();
  });

  it('transitions to LIVE after 3s', () => {
    const events: string[] = [];
    const stop = createFixture({
      onOverlayState: (s) => events.push(s),
      onFrame: () => {},
      onTranscriptLine: () => {},
      onPostCallSummary: () => {},
      onElapsed: () => {},
    });
    vi.advanceTimersByTime(3100);
    expect(events).toContain('LIVE');
    stop();
  });

  it('transitions to DANGER after 15s', () => {
    const events: string[] = [];
    const stop = createFixture({
      onOverlayState: (s) => events.push(s),
      onFrame: () => {},
      onTranscriptLine: () => {},
      onPostCallSummary: () => {},
      onElapsed: () => {},
    });
    vi.advanceTimersByTime(15100);
    expect(events).toContain('DANGER');
    stop();
  });

  it('transitions to POSTCALL after 40s', () => {
    const events: string[] = [];
    const stop = createFixture({
      onOverlayState: (s) => events.push(s),
      onFrame: () => {},
      onTranscriptLine: () => {},
      onPostCallSummary: () => {},
      onElapsed: () => {},
    });
    vi.advanceTimersByTime(40100);
    expect(events).toContain('POSTCALL');
    stop();
  });
});
```

**Step 3: Run test — expect FAIL**

```bash
cd apps/extension && pnpm exec vitest run mock/fixture.test.ts
```
Expected: FAIL — `Cannot find module './fixture'`

**Step 4: Create `apps/extension/mock/fixture.ts`**

```ts
import type {
  OverlayState,
  SignalFrame,
  TranscriptLine,
  PostCallSummary,
} from '@signal/types';

interface FixtureCallbacks {
  onOverlayState: (state: OverlayState) => void;
  onFrame: (frame: SignalFrame) => void;
  onTranscriptLine: (line: TranscriptLine) => void;
  onPostCallSummary: (summary: PostCallSummary) => void;
  onElapsed: (seconds: number) => void;
}

const TRANSCRIPT: TranscriptLine[] = [
  { speaker: 'prospect', text: 'Tell me more about the FDE model and how it compares to Mem0.', timestamp: 4000 },
  { speaker: 'user', text: 'Great question. We solve retrieval accountability, not just retrieval.', timestamp: 7000 },
  { speaker: 'prospect', text: 'What does that mean in practice for regulated industries?', timestamp: 12000 },
  { speaker: 'user', text: 'Every memory operation is auditable — read, write, delete. Mem0 has no audit trail.', timestamp: 18000 },
  { speaker: 'prospect', text: 'Interesting. What are your pricing tiers?', timestamp: 25000 },
];

const FRAMES: Array<{ t: number; frame: SignalFrame }> = [
  {
    t: 3000,
    frame: {
      prompt: { type: 'ASK', text: 'Open with their top priority — "What's the #1 thing you need memory to do reliably?"', confidence: 0.85, isNudge: false, timestamp: 3000 },
      bodyLang: { eyeContact: 'direct', posture: 'forward', microExpressions: 'engaged' },
      sentiment: 55,
      dangerFlag: false,
      dangerReason: null,
    },
  },
  {
    t: 8000,
    frame: {
      prompt: { type: 'REFRAME', text: 'Lead with accountability, not accuracy. "Mem0 solves retrieval. We solve retrieval accountability — that\'s what regulated industries audit."', confidence: 0.92, isNudge: false, timestamp: 8000 },
      bodyLang: { eyeContact: 'strong', posture: 'forward', microExpressions: 'nodding' },
      sentiment: 74,
      dangerFlag: false,
      dangerReason: null,
    },
  },
  {
    t: 15000,
    frame: {
      prompt: { type: 'WARN', text: 'They\'ve leaned back. Re-engage with a direct question before continuing.', confidence: 0.88, isNudge: true, timestamp: 15000 },
      bodyLang: { eyeContact: 'moderate', posture: 'leaning back', microExpressions: 'thinking' },
      sentiment: 48,
      dangerFlag: true,
      dangerReason: 'Disengagement detected — posture shift + sentiment drop',
    },
  },
  {
    t: 22000,
    frame: {
      prompt: { type: 'ASK', text: '"What would it take for you to pilot this with one team in Q3?"', confidence: 0.91, isNudge: false, timestamp: 22000 },
      bodyLang: { eyeContact: 'direct', posture: 'neutral', microExpressions: 'engaged' },
      sentiment: 68,
      dangerFlag: false,
      dangerReason: null,
    },
  },
  {
    t: 30000,
    frame: {
      prompt: { type: 'CLOSE', text: 'Buying signal detected. Anchor next step: "Should I send the pilot agreement to you directly?"', confidence: 0.94, isNudge: false, timestamp: 30000 },
      bodyLang: { eyeContact: 'strong', posture: 'forward', microExpressions: 'nodding' },
      sentiment: 82,
      dangerFlag: false,
      dangerReason: null,
    },
  },
];

const POST_CALL_SUMMARY: PostCallSummary = {
  winSignals: ['Strong nodding at accountability framing', 'Asked about pricing unprompted', 'Leaned forward at pilot mention'],
  objections: ['Pricing concern raised at t=25s', 'Compared to Mem0 twice'],
  decisions: ['Pilot discussion initiated', 'Q3 timeline floated', 'Direct contact confirmed'],
  followUpDraft: 'Hi [name], great speaking today. As discussed, I\'ll send over the pilot agreement for a Q3 start. Looking forward to showing you the audit trail in action.',
};

export function createFixture(callbacks: FixtureCallbacks): () => void {
  const timers: ReturnType<typeof setTimeout>[] = [];
  const startTime = Date.now();

  // Immediately fire IDLE
  callbacks.onOverlayState('IDLE');

  // Elapsed ticker
  const ticker = setInterval(() => {
    callbacks.onElapsed(Math.floor((Date.now() - startTime) / 1000));
  }, 1000);

  // Transition to LIVE at t=3s
  timers.push(setTimeout(() => callbacks.onOverlayState('LIVE'), 3000));

  // Transition to DANGER at t=15s
  timers.push(setTimeout(() => callbacks.onOverlayState('DANGER'), 15000));

  // Recover to LIVE at t=22s
  timers.push(setTimeout(() => callbacks.onOverlayState('LIVE'), 22000));

  // POSTCALL at t=40s
  timers.push(setTimeout(() => {
    callbacks.onOverlayState('POSTCALL');
    callbacks.onPostCallSummary(POST_CALL_SUMMARY);
  }, 40000));

  // Reset/loop at t=48s
  timers.push(setTimeout(() => callbacks.onOverlayState('IDLE'), 48000));

  // Transcript lines
  for (const line of TRANSCRIPT) {
    timers.push(setTimeout(() => callbacks.onTranscriptLine(line), line.timestamp));
  }

  // Frames
  for (const { t, frame } of FRAMES) {
    timers.push(setTimeout(() => callbacks.onFrame(frame), t));
  }

  return () => {
    clearInterval(ticker);
    timers.forEach(clearTimeout);
  };
}
```

**Step 5: Run test — expect PASS**

```bash
cd apps/extension && pnpm exec vitest run mock/fixture.test.ts
```
Expected: 4 tests PASS

**Step 6: Commit**

```bash
git add apps/extension/mock/ apps/extension/vitest.config.ts
git commit -m "feat: add mock fixture state machine with vitest tests"
```

---

## Task 13: Overlay root component

**Files:**
- Create: `apps/extension/overlay/Overlay.tsx`

**Step 1: Create `Overlay.tsx`**

```tsx
import '../assets/styles/globals.css';
import { useEffect } from 'react';
import { useSignalStore } from './store';
import { createFixture } from '../mock/fixture';
import { GlassPanel } from '../components/GlassPanel';
import { SentimentArc } from '../components/SentimentArc';
import { BodyLangRead } from '../components/BodyLangRead';
import { PromptCard } from '../components/PromptCard';
import { TranscriptFeed } from '../components/TranscriptFeed';

// Format elapsed seconds as MM:SS
function formatTime(s: number): string {
  const m = Math.floor(s / 60).toString().padStart(2, '0');
  const sec = (s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
}

function IdlePill({ elapsed, status }: { elapsed: number; status: 'nominal' | 'nudge' | 'danger' }) {
  const dotColor = {
    nominal: 'bg-[--success]',
    nudge: 'bg-[--warning]',
    danger: 'bg-[--danger]',
  }[status];

  const label = status === 'nudge' ? 'Nudge ready' : status === 'danger' ? 'Off track' : `SIGNAL · ${formatTime(elapsed)}`;

  return (
    <GlassPanel variant="pill">
      <div className={`w-1.5 h-1.5 rounded-full ${dotColor} mr-2 shrink-0`} />
      <span className="text-[13px] font-medium text-[--text-primary] truncate">{label}</span>
    </GlassPanel>
  );
}

function LivePanel({ elapsed, danger }: { elapsed: number; danger: boolean }) {
  const { frame, transcript } = useSignalStore();
  if (!frame) return null;

  return (
    <GlassPanel variant="panel" danger={danger}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-black/[0.06]">
        <span className="text-[12px] font-semibold tracking-[0.02em] text-[--text-primary]">
          SIG<span className="text-[--accent]">NAL</span>
        </span>
        <div className="flex items-center gap-1.5 bg-[rgba(48,209,88,0.12)] text-[#1a8c3a] text-[10px] font-semibold px-2.5 py-1 rounded-full tracking-[0.04em]">
          <div className="w-1.5 h-1.5 rounded-full bg-[--success]" />
          LIVE · {formatTime(elapsed)}
        </div>
      </div>

      {/* Sentiment */}
      <SentimentArc value={frame.sentiment} />

      {/* Body language */}
      <BodyLangRead data={frame.bodyLang} />

      {/* Transcript */}
      <TranscriptFeed lines={transcript} />

      {/* Prompt */}
      <PromptCard prompt={frame.prompt} />
    </GlassPanel>
  );
}

function PostCallPanel() {
  const { postCallSummary } = useSignalStore();
  if (!postCallSummary) return null;

  return (
    <GlassPanel variant="panel">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-black/[0.06]">
        <span className="text-[12px] font-semibold text-[--text-primary]">
          SIG<span className="text-[--accent]">NAL</span>
        </span>
        <span className="text-[10px] font-semibold text-[--text-secondary] tracking-[0.04em]">CALL COMPLETE</span>
      </div>

      <div className="px-4 py-3 space-y-2">
        {/* Win signals */}
        {postCallSummary.winSignals.map((s, i) => (
          <div key={i} className="text-[11px] px-3 py-1.5 bg-[rgba(48,209,88,0.08)] rounded-lg text-[#1a8c3a]">
            ✓ {s}
          </div>
        ))}

        {/* Decisions */}
        {postCallSummary.decisions.map((d, i) => (
          <div key={i} className="text-[11px] px-3 py-1.5 bg-[--accent-subtle] rounded-lg text-[--accent]">
            → {d}
          </div>
        ))}

        {/* Status rows */}
        <div className="text-[11px] px-3 py-1.5 bg-black/[0.04] rounded-lg text-[--text-secondary]">
          ⟳ Follow-up draft queued
        </div>
      </div>
    </GlassPanel>
  );
}

interface OverlayProps {
  useMockFixture?: boolean;
}

export function Overlay({ useMockFixture = false }: OverlayProps) {
  const {
    overlayState,
    frame,
    elapsedSeconds,
    setOverlayState,
    setFrame,
    appendTranscriptLine,
    setPostCallSummary,
    setElapsedSeconds,
  } = useSignalStore();

  // Wire mock fixture when requested (harness mode)
  useEffect(() => {
    if (!useMockFixture) return;
    const stop = createFixture({
      onOverlayState: setOverlayState,
      onFrame: setFrame,
      onTranscriptLine: appendTranscriptLine,
      onPostCallSummary: setPostCallSummary,
      onElapsed: setElapsedSeconds,
    });
    return stop;
  }, [useMockFixture]);

  const idleStatus =
    overlayState === 'DANGER' ? 'danger'
    : frame?.isNudge ? 'nudge'
    : 'nominal';

  return (
    <>
      {overlayState === 'IDLE' && (
        <IdlePill elapsed={elapsedSeconds} status={idleStatus} />
      )}
      {(overlayState === 'LIVE' || overlayState === 'DANGER') && (
        <LivePanel elapsed={elapsedSeconds} danger={overlayState === 'DANGER'} />
      )}
      {overlayState === 'POSTCALL' && <PostCallPanel />}
    </>
  );
}
```

**Step 2: Commit**

```bash
git add apps/extension/overlay/Overlay.tsx
git commit -m "feat: add Overlay root component — all 4 states"
```

---

## Task 14: Dev harness entrypoint

**Files:**
- Create: `apps/extension/entrypoints/harness/index.html`
- Create: `apps/extension/entrypoints/harness/main.tsx`

**Step 1: Create `index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>SIGNAL Harness</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      width: 100vw;
      height: 100vh;
      background: #1a1a2e;
      background-image:
        radial-gradient(ellipse at 30% 20%, rgba(0,113,227,0.15) 0%, transparent 60%),
        radial-gradient(ellipse at 80% 70%, rgba(48,209,88,0.08) 0%, transparent 50%);
      overflow: hidden;
    }
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="./main.tsx"></script>
</body>
</html>
```

**Step 2: Create `main.tsx`**

```tsx
import { createRoot } from 'react-dom/client';
import { useSignalStore } from '../../overlay/store';
import { Overlay } from '../../overlay/Overlay';
import type { OverlayState } from '@signal/types';
import '../../assets/styles/globals.css';

const STATES: OverlayState[] = ['IDLE', 'LIVE', 'DANGER', 'POSTCALL'];

function HarnessControls() {
  const { overlayState, setOverlayState, reset } = useSignalStore();

  return (
    <div
      style={{
        position: 'fixed',
        top: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: 8,
        zIndex: 9999,
      }}
    >
      {STATES.map((s) => (
        <button
          key={s}
          onClick={() => setOverlayState(s)}
          style={{
            padding: '6px 14px',
            borderRadius: 100,
            border: '1px solid rgba(255,255,255,0.2)',
            background: overlayState === s ? 'rgba(0,113,227,0.8)' : 'rgba(255,255,255,0.1)',
            color: '#fff',
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
            letterSpacing: '0.04em',
            fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
            backdropFilter: 'blur(8px)',
          }}
        >
          {s}
        </button>
      ))}
      <button
        onClick={reset}
        style={{
          padding: '6px 14px',
          borderRadius: 100,
          border: '1px solid rgba(255,255,255,0.15)',
          background: 'rgba(255,255,255,0.06)',
          color: 'rgba(255,255,255,0.5)',
          fontSize: 11,
          fontWeight: 600,
          cursor: 'pointer',
          letterSpacing: '0.04em',
          fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
          backdropFilter: 'blur(8px)',
        }}
      >
        RESET
      </button>
    </div>
  );
}

function HarnessApp() {
  return (
    <>
      <HarnessControls />
      {/* Overlay anchored bottom-right, same as Chrome extension */}
      <div
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          zIndex: 1000,
        }}
      >
        <Overlay useMockFixture={true} />
      </div>
    </>
  );
}

const root = document.getElementById('root')!;
createRoot(root).render(<HarnessApp />);
```

**Step 3: Start harness and verify visually**

```bash
cd "/Users/mahomedayob/SIGNAL BUILD" && pnpm dev
```

Open `http://localhost:3000/harness.html` in Chrome.

Verify:
- [ ] Dark background with gradient renders
- [ ] IDLE pill appears bottom-right with green dot + "SIGNAL · 00:00"
- [ ] Auto-cycle: after 3s, panel expands to LIVE state
- [ ] After 15s, DANGER state with amber border pulse
- [ ] After 22s, returns to LIVE
- [ ] After 40s, POSTCALL panel with summary
- [ ] State buttons at top switch states immediately
- [ ] RESET button returns to IDLE

**Step 4: Commit**

```bash
git add apps/extension/entrypoints/harness/
git commit -m "feat: add dev harness entrypoint with state controls"
```

---

## Task 15: Content script — shadow DOM injection

**Files:**
- Create: `apps/extension/entrypoints/content.tsx`

**Step 1: Create `content.tsx`**

```tsx
import ReactDOM from 'react-dom/client';
import { createShadowRootUi } from 'wxt/client';
import { Overlay } from '../overlay/Overlay';

export default defineContentScript({
  matches: [
    '*://meet.google.com/*',
    '*://*.zoom.us/wc/*',
    '*://teams.microsoft.com/*',
  ],
  cssInjectionMode: 'ui',

  async main(ctx) {
    const ui = await createShadowRootUi(ctx, {
      name: 'signal-overlay',
      position: 'overlay',
      anchor: 'body',

      onMount(container, _shadow, shadowHost) {
        // Position the host element fixed bottom-right
        Object.assign(shadowHost.style, {
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: '2147483647',
          pointerEvents: 'none',
          width: 'auto',
          height: 'auto',
        });
        // Re-enable pointer events on the container
        container.style.pointerEvents = 'auto';

        const root = ReactDOM.createRoot(container);
        root.render(<Overlay useMockFixture={true} />);
        return root;
      },

      onRemove(root) {
        root?.unmount();
      },
    });

    ui.mount();
  },
});
```

**Step 2: Build extension**

```bash
cd "/Users/mahomedayob/SIGNAL BUILD" && pnpm build
```
Expected: `.output/chrome-mv3/` directory created, no TypeScript errors

**Step 3: Load in Chrome and verify**

1. Open `chrome://extensions`
2. Enable "Developer mode" (top-right toggle)
3. Click "Load unpacked"
4. Select `/Users/mahomedayob/SIGNAL BUILD/apps/extension/.output/chrome-mv3`
5. Navigate to `https://meet.google.com`
6. Verify:
   - [ ] Overlay appears bottom-right
   - [ ] IDLE pill visible
   - [ ] Auto-cycles through states
   - [ ] Glass surfaces render (blur + translucency)
   - [ ] No console errors

**Step 4: Commit**

```bash
git add apps/extension/entrypoints/content.tsx
git commit -m "feat: add content script with shadow DOM overlay injection"
```

---

## Task 16: Final polish + turbo scripts wire-up

**Files:**
- Modify: `apps/extension/package.json` — add `test` script

**Step 1: Add test script to extension `package.json`**

Edit `apps/extension/package.json`, add to scripts:
```json
"test": "vitest run"
```

**Step 2: Run full pipeline**

```bash
cd "/Users/mahomedayob/SIGNAL BUILD"
pnpm typecheck
pnpm test
pnpm build
```

Expected:
- `pnpm typecheck` → 0 errors
- `pnpm test` → 4 fixture tests PASS
- `pnpm build` → extension builds to `.output/chrome-mv3/`

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat: Phase 1 complete — SIGNAL overlay UI with mock fixture

- Turborepo monorepo, pnpm, WXT
- @signal/types + @signal/tokens shared packages
- GlassPanel, PromptCard, SentimentArc, BodyLangRead, TranscriptFeed
- All 4 overlay states: IDLE, LIVE, DANGER, POSTCALL
- Mock fixture state machine (vitest: 4 tests passing)
- Dev harness on localhost:3000/harness.html
- Chrome extension loads on meet.google.com"
```

---

## Phase 1 success criteria checklist

- [ ] `pnpm dev` → harness at `localhost:3000/harness.html`
- [ ] All 4 states render with Apple Glass surfaces
- [ ] Auto-cycle: IDLE → LIVE (t=3s) → DANGER (t=15s) → LIVE (t=22s) → POSTCALL (t=40s) → loop
- [ ] State control buttons switch states instantly
- [ ] Pill → panel morph animation: 380ms spring
- [ ] Prompt card fades on update: 280ms
- [ ] Sentiment bar animates: 1200ms
- [ ] Danger border pulses: amber, continuous
- [ ] Transcript lines slide in: 320ms
- [ ] `pnpm dev:ext` → WXT dev mode opens Chrome
- [ ] Extension loads unpacked on `meet.google.com`
- [ ] Overlay appears fixed bottom-right
- [ ] Shadow DOM isolates styles (page CSS does not bleed in)
- [ ] `pnpm typecheck` → 0 errors
- [ ] `pnpm test` → 4 fixture tests PASS
- [ ] `pnpm build` → `.output/chrome-mv3/` produced
