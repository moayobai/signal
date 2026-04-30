/**
 * SIGNAL Phase 4 — scripted end-to-end smoke test (simulation mode).
 *
 * Exercises the full backend stack WITHOUT real API keys:
 *   1. Boots apps/server on a clean :8080 (fresh signal.db)
 *   2. Probes REST endpoints — contacts CRUD, calls, analytics, dashboard SPA
 *   3. Opens a WebSocket, sends `start` with a prospect, then `stop`
 *   4. Verifies contact + call_session rows were written
 *   5. Seeds synthetic transcript lines, signal frames, and a summary directly
 *      via DB (simulating what real Deepgram+Claude would have produced)
 *   6. Re-probes REST endpoints to verify the read path surfaces the data
 *   7. Writes a human-readable summary and exits non-zero on any failure
 *
 * Run: pnpm --filter server exec tsx ../../scripts/e2e-smoke.ts
 * Or:  tsx scripts/e2e-smoke.ts  (from repo root, with tsx installed)
 */

import { spawn, ChildProcess } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import WebSocket from 'ws';
import Database from 'better-sqlite3';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..');
const SERVER_CWD = resolve(REPO_ROOT, 'apps/server');
const DB_PATH = resolve(SERVER_CWD, 'signal.db');
const PORT = Number(process.env.E2E_PORT ?? 18080);
const BASE = `http://localhost:${PORT}`;
const AUTH_TOKEN = 'signal-e2e-token';
const WS_URL = `ws://localhost:${PORT}/ws?token=${encodeURIComponent(AUTH_TOKEN)}`;

let serverProc: ChildProcess | null = null;
const results: Array<{ step: string; ok: boolean; detail?: string }> = [];

function log(msg: string): void {
  process.stdout.write(`[E2E] ${msg}\n`);
}
function record(step: string, ok: boolean, detail?: string): void {
  results.push({ step, ok, detail });
  log(`${ok ? 'OK  ' : 'FAIL'} — ${step}${detail ? `  (${detail})` : ''}`);
}

async function startServer(): Promise<void> {
  await Bun_rm(DB_PATH);
  await Bun_rm(`${DB_PATH}-shm`);
  await Bun_rm(`${DB_PATH}-wal`);

  log('starting server…');
  // Use the node_modules tsx binary directly to avoid PATH lookups for pnpm
  const tsxBin = resolve(SERVER_CWD, 'node_modules/.bin/tsx');
  serverProc = spawn(tsxBin, ['src/index.ts'], {
    cwd: SERVER_CWD,
    env: {
      ...process.env,
      PORT: String(PORT),
      DATABASE_URL: './signal.db',
      SIGNAL_AUTH_TOKEN: AUTH_TOKEN,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let ready = false;
  serverProc.stdout?.on('data', chunk => {
    const s = chunk.toString();
    if (s.includes('Server listening at')) ready = true;
    process.stdout.write(`  [server] ${s}`);
  });
  serverProc.stderr?.on('data', chunk => process.stderr.write(`  [server:err] ${chunk}`));

  for (let i = 0; i < 40; i++) {
    if (ready) return;
    await wait(250);
  }
  throw new Error('Server did not start within 10s');
}

async function stopServer(): Promise<void> {
  if (!serverProc) return;
  serverProc.kill('SIGTERM');
  await wait(500);
  if (!serverProc.killed) serverProc.kill('SIGKILL');
}

async function Bun_rm(path: string): Promise<void> {
  try {
    await import('node:fs/promises').then(fs => fs.rm(path, { force: true }));
  } catch {}
}

async function http<T = unknown>(
  path: string,
  init?: RequestInit,
): Promise<{ status: number; body: T | string }> {
  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${AUTH_TOKEN}`);
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  const text = await res.text();
  let body: T | string = text;
  try {
    body = JSON.parse(text) as T;
  } catch {}
  return { status: res.status, body };
}

async function probeAuthGuards(): Promise<void> {
  const unauthenticated = await fetch(`${BASE}/api/contacts`);
  record(
    'GET /api/contacts rejects missing auth',
    unauthenticated.status === 401,
    `status=${unauthenticated.status}`,
  );

  const invalid = await fetch(`${BASE}/api/contacts`, {
    headers: { Authorization: 'Bearer wrong-token' },
  });
  record(
    'GET /api/contacts rejects wrong auth',
    invalid.status === 401,
    `status=${invalid.status}`,
  );

  const dashboardToken = await fetch(`${BASE}/dashboard/?token=${encodeURIComponent(AUTH_TOKEN)}`, {
    redirect: 'manual',
  });
  record(
    'GET /dashboard/?token=... redirects after setting cookie',
    dashboardToken.status === 302 &&
      dashboardToken.headers.get('set-cookie')?.includes('signal_auth=') === true &&
      dashboardToken.headers.get('location') === '/dashboard/',
    `status=${dashboardToken.status}, location=${dashboardToken.headers.get('location')}`,
  );
}

async function probeRestEmpty(): Promise<void> {
  const health = await http<{ ok: boolean }>('/health');
  record(
    'GET /health returns ok',
    health.status === 200 && (health.body as any)?.ok === true,
    `status=${health.status}`,
  );

  const contacts = await http<unknown[]>('/api/contacts');
  record(
    'GET /api/contacts empty array',
    contacts.status === 200 && Array.isArray(contacts.body) && contacts.body.length === 0,
  );

  const calls = await http<unknown[]>('/api/calls');
  record(
    'GET /api/calls empty array',
    calls.status === 200 && Array.isArray(calls.body) && calls.body.length === 0,
  );

  const analytics = await http<unknown[]>('/api/analytics/sentiment');
  record(
    'GET /api/analytics/sentiment empty array',
    analytics.status === 200 && Array.isArray(analytics.body),
  );

  const octaRes = await http<{ context: string | null }>('/api/octamem/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prospect: { name: 'James', company: 'Acme' } }),
  });
  record(
    'POST /api/octamem/query returns null with placeholder key',
    octaRes.status === 200 && (octaRes.body as any)?.context === null,
  );

  const dashboard = await fetch(`${BASE}/dashboard/`, {
    headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
  });
  record(
    'GET /dashboard/ serves SPA',
    dashboard.status === 200,
    `status=${dashboard.status}, content-type=${dashboard.headers.get('content-type')}`,
  );
}

interface WSTranscript {
  received: string[];
  errors: string[];
  closed: boolean;
}

async function runWsSession(prospect: { name: string; company?: string }): Promise<WSTranscript> {
  const transcript: WSTranscript = { received: [], errors: [], closed: false };

  const ws = new WebSocket(WS_URL);
  await new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', reject);
  });

  ws.on('message', data => transcript.received.push(data.toString()));
  ws.on('error', err => transcript.errors.push(err.message));
  ws.on('close', () => {
    transcript.closed = true;
  });

  await wait(100); // let `connected` arrive

  ws.send(
    JSON.stringify({
      type: 'start',
      platform: 'meet',
      callType: 'investor',
      prospect,
    }),
  );

  // Let the server do its async work (contact upsert, OctaMem query, call_session insert)
  await wait(600);

  ws.send(JSON.stringify({ type: 'stop' }));
  await wait(400);

  ws.close();
  await wait(200);

  return transcript;
}

async function probeWsFlow(): Promise<string | null> {
  log('opening WebSocket…');
  const prospect = { name: 'James Carter', company: 'Acme Ventures' };
  const result = await runWsSession(prospect);

  record(
    'WS received any messages',
    result.received.length > 0,
    `count=${result.received.length}, errors=${result.errors.length}`,
  );

  const connected = result.received
    .map(m => {
      try {
        return JSON.parse(m);
      } catch {
        return null;
      }
    })
    .find(m => m?.type === 'connected');
  record(
    'WS received `connected` message',
    !!connected,
    connected ? `sessionId=${connected.sessionId}` : 'missing',
  );

  const liveState = result.received
    .map(m => {
      try {
        return JSON.parse(m);
      } catch {
        return null;
      }
    })
    .find(m => m?.type === 'state' && m.overlayState === 'LIVE');
  record('WS received LIVE state after start', !!liveState);

  return connected?.sessionId ?? null;
}

async function probeDbAfterStart(): Promise<{
  contactId: string | null;
  sessionId: string | null;
}> {
  const db = new Database(DB_PATH, { readonly: true });

  const contacts = db.prepare('SELECT * FROM contacts').all() as any[];
  record(
    'DB contacts row present',
    contacts.length === 1,
    contacts[0] ? `name=${contacts[0].name}, company=${contacts[0].company}` : 'no rows',
  );

  const sessions = db.prepare('SELECT * FROM call_sessions').all() as any[];
  record(
    'DB call_sessions row present',
    sessions.length === 1,
    sessions[0]
      ? `platform=${sessions[0].platform}, type=${sessions[0].call_type}, ended=${!!sessions[0].ended_at}`
      : 'no rows',
  );

  record(
    'call_session linked to contact',
    sessions[0]?.contact_id === contacts[0]?.id,
    `contact_id=${sessions[0]?.contact_id}`,
  );

  // With placeholder keys, durationMs should be set (we sent stop) and sentimentAvg should be NULL (no frames)
  record('call_session ended_at populated on stop', sessions[0]?.ended_at !== null);
  record(
    'call_session sentiment_avg is NULL (no frames in sim)',
    sessions[0]?.sentiment_avg === null,
  );

  db.close();
  return {
    contactId: contacts[0]?.id ?? null,
    sessionId: sessions[0]?.id ?? null,
  };
}

async function seedSyntheticData(contactId: string, sessionId: string): Promise<void> {
  log('seeding synthetic transcript/frames/summary (simulating post-Deepgram/Claude state)…');
  const db = new Database(DB_PATH);
  const now = Date.now();

  // 6 transcript lines alternating speakers
  const lines = [
    { speaker: 'user', text: 'Thanks for taking the time, James.', t: now - 180_000 },
    { speaker: 'prospect', text: 'Happy to. Walk me through the round.', t: now - 170_000 },
    { speaker: 'user', text: "We're raising a three million dollar seed.", t: now - 160_000 },
    { speaker: 'prospect', text: "What's the burn?", t: now - 140_000 },
    { speaker: 'user', text: '180k monthly, 18 months of runway.', t: now - 130_000 },
    { speaker: 'prospect', text: "Send me the deck and I'll circle back.", t: now - 90_000 },
  ];
  const insertLine = db.prepare(
    'INSERT INTO transcript_lines (session_id, speaker, text, timestamp) VALUES (?, ?, ?, ?)',
  );
  for (const l of lines) insertLine.run(sessionId, l.speaker, l.text, l.t);

  // 3 signal frames
  const insertFrame = db.prepare(
    'INSERT INTO signal_frames (session_id, prompt_type, prompt_text, confidence, sentiment, danger_flag, created_at) VALUES (?,?,?,?,?,?,?)',
  );
  insertFrame.run(
    sessionId,
    'ASK',
    'Ask about their Series A timeline',
    0.82,
    68,
    0,
    now - 150_000,
  );
  insertFrame.run(
    sessionId,
    'WARN',
    'Pricing objection incoming — reframe',
    0.75,
    55,
    1,
    now - 120_000,
  );
  insertFrame.run(
    sessionId,
    'CLOSE',
    'Propose next step: deck + intro call',
    0.88,
    74,
    0,
    now - 95_000,
  );

  // Update call_session with sentimentAvg
  db.prepare('UPDATE call_sessions SET sentiment_avg = ?, duration_ms = ? WHERE id = ?').run(
    (68 + 55 + 74) / 3,
    180_000,
    sessionId,
  );

  // Summary row
  db.prepare(
    'INSERT INTO call_summaries (id, session_id, win_signals, objections, decisions, follow_up_draft, created_at) VALUES (?,?,?,?,?,?,?)',
  ).run(
    randomUUID(),
    sessionId,
    JSON.stringify(['Engaged on round size', 'Asked about runway math']),
    JSON.stringify(['Wants traction proof before committing']),
    JSON.stringify(['Send deck by Friday', 'Intro to 2 LPs next week']),
    'James, great speaking today — attaching the deck as discussed. Happy to walk through the traction data anytime next week.',
    now,
  );
  db.close();
}

async function probeRestPopulated(contactId: string, sessionId: string): Promise<void> {
  const contact = await http<any>(`/api/contacts/${contactId}`);
  record(
    'GET /api/contacts/:id returns seeded contact',
    contact.status === 200 && (contact.body as any).name === 'James Carter',
  );

  const update = await http<any>(`/api/contacts/${contactId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'Managing Partner', notes: 'Decision maker.' }),
  });
  record(
    'PUT /api/contacts/:id persists role+notes',
    update.status === 200 && (update.body as any).role === 'Managing Partner',
  );

  const calls = await http<any[]>('/api/calls');
  record(
    'GET /api/calls now returns 1 row',
    calls.status === 200 && Array.isArray(calls.body) && (calls.body as any[]).length === 1,
  );

  const transcript = await http<any[]>(`/api/calls/${sessionId}/transcript`);
  record(
    'GET /api/calls/:id/transcript returns 6 lines',
    transcript.status === 200 &&
      Array.isArray(transcript.body) &&
      (transcript.body as any[]).length === 6,
  );

  const frames = await http<any[]>(`/api/calls/${sessionId}/frames`);
  record(
    'GET /api/calls/:id/frames returns 3 frames',
    frames.status === 200 && (frames.body as any[]).length === 3,
  );

  const summary = await http<any>(`/api/calls/${sessionId}/summary`);
  record(
    'GET /api/calls/:id/summary parses JSON arrays',
    summary.status === 200 &&
      Array.isArray((summary.body as any).winSignals) &&
      (summary.body as any).winSignals.length === 2 &&
      (summary.body as any).followUpDraft.includes('James'),
  );

  const promptTypes = await http<Array<{ promptType: string; count: number }>>(
    '/api/analytics/prompt-types',
  );
  const typesSet = new Set((promptTypes.body as any[]).map(r => r.promptType));
  record(
    'GET /api/analytics/prompt-types aggregates ASK/WARN/CLOSE',
    promptTypes.status === 200 &&
      typesSet.has('ASK') &&
      typesSet.has('WARN') &&
      typesSet.has('CLOSE'),
  );

  const objections = await http<Array<{ objection: string; count: number }>>(
    '/api/analytics/objections',
  );
  record(
    'GET /api/analytics/objections returns aggregated list',
    objections.status === 200 && (objections.body as any[]).length >= 1,
  );

  const sentimentTrend = await http<any[]>('/api/analytics/sentiment');
  record(
    'GET /api/analytics/sentiment returns weekly bucket',
    sentimentTrend.status === 200 && (sentimentTrend.body as any[]).length === 1,
  );
}

async function probeSecondCall(): Promise<void> {
  log('second WS session with same prospect — should update existing contact (upsert)…');
  await runWsSession({ name: 'James Carter', company: 'Acme Ventures' });
  await wait(200);

  const db = new Database(DB_PATH, { readonly: true });
  const contacts = db.prepare('SELECT * FROM contacts').all() as any[];
  const sessions = db.prepare('SELECT * FROM call_sessions').all() as any[];
  db.close();

  record('Second start does NOT create duplicate contact', contacts.length === 1);
  record('Second start creates new call_session', sessions.length === 2);
}

function printSummary(): number {
  const total = results.length;
  const failed = results.filter(r => !r.ok).length;
  log('');
  log('═════════════════════════════════════════════');
  log(`  RESULT: ${total - failed}/${total} checks passed`);
  log('═════════════════════════════════════════════');
  if (failed > 0) {
    log('');
    log('Failures:');
    for (const r of results.filter(r => !r.ok))
      log(`  ✗ ${r.step}${r.detail ? ` — ${r.detail}` : ''}`);
  }
  return failed;
}

async function main(): Promise<void> {
  try {
    await startServer();
    await probeAuthGuards();
    await probeRestEmpty();

    await probeWsFlow();
    const { contactId, sessionId } = await probeDbAfterStart();

    if (contactId && sessionId) {
      await seedSyntheticData(contactId, sessionId);
      await probeRestPopulated(contactId, sessionId);
    }

    await probeSecondCall();
  } catch (err) {
    log(`FATAL: ${err instanceof Error ? err.message : String(err)}`);
    record('E2E harness did not throw', false, err instanceof Error ? err.message : String(err));
  } finally {
    await stopServer();
  }

  const failed = printSummary();
  process.exit(failed > 0 ? 1 : 0);
}

main();
