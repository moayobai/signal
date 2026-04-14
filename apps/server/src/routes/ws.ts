import type { FastifyInstance } from 'fastify';
import { CallSession } from '../services/session.js';
import { createDeepgramClient } from '../services/deepgram.js';
import { callClaude } from '../services/claude.js';
import { buildSystemPrompt, buildUserPrompt } from '../prompts/live.js';
import type { ClientMessage, ServerMessage } from '@signal/types';

const CLAUDE_INTERVAL_MS = 12_000;
const MIN_NEW_LINES = 2;

interface WsRouteOptions {
  anthropicApiKey: string;
  deepgramApiKey: string;
}

export function registerWsRoute(app: FastifyInstance, opts: WsRouteOptions): void {
  app.get('/ws', { websocket: true }, (socket) => {
    const session = new CallSession('meet', 'enterprise');

    function send(msg: ServerMessage): void {
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify(msg));
      }
    }

    // Use setImmediate so the 'open' event on the client side fires first,
    // giving test listeners time to attach before the connected message arrives.
    setImmediate(() => send({ type: 'connected', sessionId: session.id }));

    const dg = createDeepgramClient({
      apiKey: opts.deepgramApiKey,
      onTranscript: (line) => {
        session.addLine(line);
        send({ type: 'transcript', line });

        const danger = session.detectKeyword(line.text);
        if (danger) {
          send({ type: 'state', overlayState: 'DANGER' });
        }
      },
      onError: (err) => {
        console.error('[SIGNAL] Deepgram error:', err);
        send({ type: 'error', message: 'STT error' });
      },
    });

    const systemPrompt = buildSystemPrompt(session.callType);

    const claudeTimer = setInterval(async () => {
      if (session.newLinesSinceLastCall < MIN_NEW_LINES) return;

      const window = session.getWindow();
      session.resetNewLines();

      if (session.isSilent()) {
        send({ type: 'state', overlayState: 'DANGER' });
      }

      const frame = await callClaude({
        apiKey: opts.anthropicApiKey,
        systemPrompt,
        userPrompt: buildUserPrompt(window),
      });

      if (frame) {
        send({ type: 'frame', frame });
        if (frame.dangerFlag) {
          send({ type: 'state', overlayState: 'DANGER' });
        } else {
          send({ type: 'state', overlayState: 'LIVE' });
        }
      }
    }, CLAUDE_INTERVAL_MS);

    socket.on('message', (rawData) => {
      // Try JSON parse first; if it fails, treat as binary audio
      const data = Buffer.isBuffer(rawData)
        ? rawData
        : Buffer.from(rawData as ArrayBuffer);

      try {
        const msg = JSON.parse(data.toString()) as ClientMessage;
        if (msg.type === 'start') {
          send({ type: 'state', overlayState: 'LIVE' });
        } else if (msg.type === 'stop') {
          cleanup();
        }
        return;
      } catch {
        // Not JSON — treat as binary audio
        dg.send(data);
      }
    });

    function cleanup(): void {
      clearInterval(claudeTimer);
      dg.finish();
    }

    socket.on('close', cleanup);
    socket.on('error', (err) => {
      console.error('[SIGNAL] WS socket error:', err);
      cleanup();
    });
  });
}
