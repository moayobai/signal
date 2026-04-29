import 'dotenv/config';
import Fastify from 'fastify';
import websocketPlugin from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { registerWsRoute } from './routes/ws.js';
import { registerApiRoutes } from './routes/api.js';
import { initDb } from './services/db.js';
import { createAIProvider } from './services/ai.js';
import { createCalendarProvider } from './services/calendar.js';
import { startCalendarPoller } from './services/calendar-poller.js';
import { registerSecurity } from './services/security.js';
import type { CallFramework } from '@signal/types';

const PORT = Number(process.env.PORT ?? 8080);
const AI_PROVIDER = (process.env.AI_PROVIDER ?? 'claude') as 'claude' | 'openrouter';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? 'sk-ant-your-key-here';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY ?? 'sk-or-your-key-here';
const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY ?? 'your-deepgram-key-here';
const DEEPGRAM_MODEL = process.env.DEEPGRAM_MODEL ?? 'nova-3';
const OCTAMEM_API_KEY = process.env.OCTAMEM_API_KEY ?? 'your-octamem-key-here';
const HUME_API_KEY = process.env.HUME_API_KEY ?? 'your-hume-key-here';
const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY ?? 'your-voyage-key-here';
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL ?? 'your-slack-webhook-url-here';
const HUBSPOT_API_KEY = process.env.HUBSPOT_API_KEY ?? 'your-hubspot-key-here';
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL ?? '';
const DATABASE_URL = process.env.DATABASE_URL ?? './signal.db';
const LIVE_MODEL = process.env.LIVE_MODEL ?? 'claude-haiku-4-5-20251001';
const SUMMARY_MODEL = process.env.SUMMARY_MODEL ?? 'claude-sonnet-4-6';
const SCORING_FRAMEWORK = (process.env.SCORING_FRAMEWORK ?? 'MEDDIC') as CallFramework;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? '';
const GOOGLE_REFRESH_TOKEN_CALENDAR = process.env.GOOGLE_REFRESH_TOKEN_CALENDAR ?? '';
const OUTLOOK_CLIENT_ID = process.env.OUTLOOK_CLIENT_ID ?? '';
const OUTLOOK_CLIENT_SECRET = process.env.OUTLOOK_CLIENT_SECRET ?? '';
const OUTLOOK_REFRESH_TOKEN = process.env.OUTLOOK_REFRESH_TOKEN ?? '';
const OUTLOOK_TENANT_ID = process.env.OUTLOOK_TENANT_ID ?? 'common';
const SIGNAL_AUTH_TOKEN = process.env.SIGNAL_AUTH_TOKEN ?? '';
const SIGNAL_AUTH_DISABLED = process.env.SIGNAL_AUTH_DISABLED === 'true';
const SIGNAL_RATE_LIMIT_MAX = Number(process.env.SIGNAL_RATE_LIMIT_MAX ?? 120);
const SIGNAL_RATE_LIMIT_WINDOW = process.env.SIGNAL_RATE_LIMIT_WINDOW ?? '1 minute';

const app = Fastify({
  logger: { transport: { target: 'pino-pretty', options: { colorize: true } } },
});

const db = initDb(DATABASE_URL);
const ai = createAIProvider({
  provider: AI_PROVIDER,
  anthropicApiKey: ANTHROPIC_API_KEY,
  openrouterApiKey: OPENROUTER_API_KEY,
});

await registerSecurity(app, {
  authToken: SIGNAL_AUTH_TOKEN,
  authDisabled: SIGNAL_AUTH_DISABLED,
  rateLimitMax: SIGNAL_RATE_LIMIT_MAX,
  rateLimitWindow: SIGNAL_RATE_LIMIT_WINDOW,
});
await app.register(websocketPlugin);

// Dashboard static files — built by `pnpm --filter server run build:dashboard` → apps/server/public
const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');
await app.register(fastifyStatic, { root: publicDir, prefix: '/dashboard/' });

// SPA fallback: any /dashboard/* request that doesn't match a built asset returns
// index.html so client-side routing (react-router) works on hard refresh and direct links.
app.setNotFoundHandler((req, reply) => {
  if (req.url.startsWith('/dashboard/')) {
    return reply.sendFile('index.html');
  }
  reply.code(404).send({ error: 'Not Found' });
});

app.get('/health', async () => ({ ok: true, ts: Date.now() }));

registerWsRoute(app, {
  db, ai,
  deepgramApiKey: DEEPGRAM_API_KEY,
  deepgramModel: DEEPGRAM_MODEL,
  humeApiKey: HUME_API_KEY,
  octamemApiKey: OCTAMEM_API_KEY,
  voyageApiKey: VOYAGE_API_KEY,
  slackWebhookUrl: SLACK_WEBHOOK_URL,
  hubspotApiKey: HUBSPOT_API_KEY,
  liveModel: LIVE_MODEL,
  summaryModel: SUMMARY_MODEL,
  scoringFramework: SCORING_FRAMEWORK,
  publicBaseUrl: PUBLIC_BASE_URL || undefined,
});
registerApiRoutes(app, { db, octamemApiKey: OCTAMEM_API_KEY, voyageApiKey: VOYAGE_API_KEY });

// Graceful shutdown: drain in-flight WebSocket sessions before exiting.
// Fly.io / systemd / Docker all send SIGTERM before SIGKILL.
async function shutdown(signal: string): Promise<void> {
  app.log.info(`[SIGNAL] ${signal} received — draining connections`);
  try {
    await app.close();
    process.exit(0);
  } catch (err) {
    app.log.error({ err }, '[SIGNAL] shutdown failed');
    process.exit(1);
  }
}
// Pre-call magic: if any calendar provider is configured, poll every 2 min
// for the user's next meeting and populate `upcoming_meetings`.
const calendarProvider = createCalendarProvider({
  google: {
    clientId: GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
    refreshToken: GOOGLE_REFRESH_TOKEN_CALENDAR,
  },
  outlook: {
    clientId: OUTLOOK_CLIENT_ID,
    clientSecret: OUTLOOK_CLIENT_SECRET,
    refreshToken: OUTLOOK_REFRESH_TOKEN,
    tenantId: OUTLOOK_TENANT_ID,
  },
});
const calendarPoller = calendarProvider
  ? startCalendarPoller({
      provider: calendarProvider,
      db,
      logger: {
        info: (m) => app.log.info(m),
        error: (m, err) => app.log.error({ err }, m),
      },
    })
  : null;

process.on('SIGTERM', () => { calendarPoller?.stop(); void shutdown('SIGTERM'); });
process.on('SIGINT',  () => { calendarPoller?.stop(); void shutdown('SIGINT'); });

try {
  await app.listen({ port: PORT, host: '0.0.0.0' });
  app.log.info(`[SIGNAL] AI provider: ${AI_PROVIDER}, DB: ${DATABASE_URL}`);
  if (AI_PROVIDER === 'claude' && ANTHROPIC_API_KEY.startsWith('sk-ant-your-key')) {
    app.log.warn('[SIGNAL] ANTHROPIC_API_KEY is placeholder — AI disabled');
  }
  if (AI_PROVIDER === 'openrouter' && OPENROUTER_API_KEY.startsWith('sk-or-your-key')) {
    app.log.warn('[SIGNAL] OPENROUTER_API_KEY is placeholder — AI disabled');
  }
  if (DEEPGRAM_API_KEY.startsWith('your-deepgram')) app.log.warn('[SIGNAL] DEEPGRAM_API_KEY is placeholder — STT disabled');
  if (OCTAMEM_API_KEY.startsWith('your-octamem')) app.log.warn('[SIGNAL] OCTAMEM_API_KEY is placeholder — memory disabled');
  if (HUME_API_KEY.startsWith('your-hume')) app.log.warn('[SIGNAL] HUME_API_KEY is placeholder — face emotion analysis disabled');
  if (VOYAGE_API_KEY.startsWith('your-voyage')) app.log.warn('[SIGNAL] VOYAGE_API_KEY is placeholder — semantic transcript search disabled');
  if (SLACK_WEBHOOK_URL.startsWith('your-slack')) app.log.warn('[SIGNAL] SLACK_WEBHOOK_URL is placeholder — Slack posting disabled');
  if (HUBSPOT_API_KEY.startsWith('your-hubspot')) app.log.warn('[SIGNAL] HUBSPOT_API_KEY is placeholder — HubSpot sync disabled');
  if (!SIGNAL_AUTH_DISABLED) app.log.info('[SIGNAL] HTTP auth enabled');
  if (!calendarProvider) {
    app.log.warn('[SIGNAL] No calendar provider configured — pre-call meeting detection disabled');
  } else {
    app.log.info('[SIGNAL] Calendar poller started (2-min interval, 15-min window)');
  }
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
