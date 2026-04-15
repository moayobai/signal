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

const PORT = Number(process.env.PORT ?? 8080);
const AI_PROVIDER = (process.env.AI_PROVIDER ?? 'claude') as 'claude' | 'openrouter';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? 'sk-ant-your-key-here';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY ?? 'sk-or-your-key-here';
const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY ?? 'your-deepgram-key-here';
const DEEPGRAM_MODEL = process.env.DEEPGRAM_MODEL ?? 'nova-3';
const OCTAMEM_API_KEY = process.env.OCTAMEM_API_KEY ?? 'your-octamem-key-here';
const DATABASE_URL = process.env.DATABASE_URL ?? './signal.db';
const LIVE_MODEL = process.env.LIVE_MODEL ?? 'claude-haiku-4-5-20251001';
const SUMMARY_MODEL = process.env.SUMMARY_MODEL ?? 'claude-sonnet-4-6';

const app = Fastify({
  logger: { transport: { target: 'pino-pretty', options: { colorize: true } } },
});

const db = initDb(DATABASE_URL);
const ai = createAIProvider({
  provider: AI_PROVIDER,
  anthropicApiKey: ANTHROPIC_API_KEY,
  openrouterApiKey: OPENROUTER_API_KEY,
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
  octamemApiKey: OCTAMEM_API_KEY,
  liveModel: LIVE_MODEL,
  summaryModel: SUMMARY_MODEL,
});
registerApiRoutes(app, { db, octamemApiKey: OCTAMEM_API_KEY });

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
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
