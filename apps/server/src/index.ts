import Fastify from 'fastify';
import websocketPlugin from '@fastify/websocket';
import { registerWsRoute } from './routes/ws.js';

const PORT = Number(process.env.PORT ?? 8080);
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? 'sk-ant-your-key-here';
const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY ?? 'your-deepgram-key-here';

const app = Fastify({
  logger: {
    transport: { target: 'pino-pretty', options: { colorize: true } },
  },
});

await app.register(websocketPlugin);

app.get('/health', async () => ({ ok: true, ts: Date.now() }));

registerWsRoute(app, {
  anthropicApiKey: ANTHROPIC_API_KEY,
  deepgramApiKey: DEEPGRAM_API_KEY,
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
