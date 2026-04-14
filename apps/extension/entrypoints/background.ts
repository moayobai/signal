import type { ClientMessage, ServerMessage } from '@signal/types';

declare const __WS_URL__: string;

const WS_URL = (typeof __WS_URL__ !== 'undefined' ? __WS_URL__ : 'ws://localhost:8080') + '/ws';
const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAYS = [1000, 2000, 4000] as const;

let wsocket: WebSocket | null = null;
let recorder: MediaRecorder | null = null;
let activeTabId: number | null = null;
let reconnectAttempt = 0;

export default defineBackground(() => {
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'START_CAPTURE') {
      activeTabId = sender.tab?.id ?? null;
      startCapture(sendResponse);
      return true; // keep channel open for async response
    }
    if (msg.type === 'STOP_CAPTURE') {
      stopCapture();
      sendResponse({ ok: true });
    }
  });
});

function startCapture(sendResponse: (r: unknown) => void): void {
  chrome.tabCapture.capture({ audio: true, video: false }, (stream) => {
    if (!stream) {
      const errMsg = chrome.runtime.lastError?.message ?? 'capture failed';
      console.error('[SIGNAL] tabCapture failed:', errMsg);
      sendResponse({ error: errMsg });
      return;
    }
    connectWs(stream);
    sendResponse({ ok: true });
  });
}

function connectWs(stream: MediaStream): void {
  const ws = new WebSocket(WS_URL);
  wsocket = ws;

  ws.onopen = () => {
    console.log('[SIGNAL] WS connected');
    reconnectAttempt = 0;
    const startMsg: ClientMessage = { type: 'start', platform: 'meet', callType: 'enterprise' };
    ws.send(JSON.stringify(startMsg));
    startRecorder(stream, ws);
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data as string) as ServerMessage;
      if (activeTabId !== null) {
        chrome.tabs.sendMessage(activeTabId, msg).catch(() => {
          // tab may have closed
        });
      }
    } catch {
      // malformed message — ignore
    }
  };

  ws.onerror = (err) => {
    console.error('[SIGNAL] WS error:', err);
  };

  ws.onclose = () => {
    console.log('[SIGNAL] WS closed');
    stopRecorder();
    if (reconnectAttempt < MAX_RECONNECT_ATTEMPTS) {
      const delay = RECONNECT_DELAYS[reconnectAttempt] ?? 4000;
      reconnectAttempt++;
      console.log(`[SIGNAL] Reconnecting in ${delay}ms (attempt ${reconnectAttempt})`);
      setTimeout(() => connectWs(stream), delay);
    }
  };
}

function startRecorder(stream: MediaStream, ws: WebSocket): void {
  const mimeType = 'audio/webm;codecs=opus';
  if (!MediaRecorder.isTypeSupported(mimeType)) {
    console.error('[SIGNAL] MediaRecorder does not support', mimeType);
    return;
  }
  const rec = new MediaRecorder(stream, { mimeType });
  recorder = rec;

  rec.ondataavailable = (e) => {
    if (e.data.size > 0 && ws.readyState === WebSocket.OPEN) {
      e.data.arrayBuffer().then(buf => ws.send(buf));
    }
  };

  rec.start(250);
  console.log('[SIGNAL] MediaRecorder started');
}

function stopRecorder(): void {
  if (recorder?.state !== 'inactive') {
    recorder?.stop();
  }
  recorder = null;
}

function stopCapture(): void {
  stopRecorder();
  if (wsocket) {
    const stopMsg: ClientMessage = { type: 'stop' };
    wsocket.send(JSON.stringify(stopMsg));
    wsocket.close();
    wsocket = null;
  }
}
