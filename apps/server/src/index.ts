import Fastify from 'fastify';
import websocketPlugin from '@fastify/websocket';
import { registerWsRoute } from './routes/ws.js';
import { initDb } from './services/db.js';
import { createAIProvider } from './services/ai.js';

const PORT = Number(process.env.PORT ?? 8080);
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? 'sk-ant-your-key-here';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY ?? 'sk-or-your-key-here';
const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY ?? 'your-deepgram-key-here';
const OCTAMEM_API_KEY = process.env.OCTAMEM_API_KEY ?? 'your-octamem-key-here';
const AI_PROVIDER = (process.env.AI_PROVIDER ?? 'claude') as 'claude' | 'openrouter';
const LIVE_MODEL = process.env.LIVE_MODEL ?? 'claude-haiku-4-5-20251001';
const SUMMARY_MODEL = process.env.SUMMARY_MODEL ?? 'claude-sonnet-4-6';
const DB_URL = process.env.DB_URL ?? 'signal.db';

const app = Fastify({
  logger: {
    transport: { target: 'pino-pretty', options: { colorize: true } },
  },
});

await app.register(websocketPlugin);

app.get('/health', async () => ({ ok: true, ts: Date.now() }));

const db = initDb(DB_URL);
const ai = createAIProvider({
  provider: AI_PROVIDER,
  anthropicApiKey: ANTHROPIC_API_KEY,
  openrouterApiKey: OPENROUTER_API_KEY,
});

registerWsRoute(app, {
  db,
  ai,
  deepgramApiKey: DEEPGRAM_API_KEY,
  octamemApiKey: OCTAMEM_API_KEY,
  liveModel: LIVE_MODEL,
  summaryModel: SUMMARY_MODEL,
});

try {
  await app.listen({ port: PORT, host: '0.0.0.0' });
  if (ANTHROPIC_API_KEY.startsWith('sk-ant-your-key')) {
    app.log.warn('[SIGNAL] ANTHROPIC_API_KEY is placeholder — Claude disabled');
  }
  if (DEEPGRAM_API_KEY.startsWith('your-deepgram')) {
    app.log.warn('[SIGNAL] DEEPGRAM_API_KEY is placeholder — STT disabled');
  }
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
