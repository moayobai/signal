import type { ClientMessage, ServerMessage, Prospect, CallType } from '@signal/types';

declare const __WS_URL__: string;

const WS_URL = (typeof __WS_URL__ !== 'undefined' ? __WS_URL__ : 'ws://localhost:8080') + '/ws';
const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAYS = [1000, 2000, 4000] as const;

let wsocket: WebSocket | null = null;
let recorder: MediaRecorder | null = null;
let activeTabId: number | null = null;
let reconnectAttempt = 0;

export default defineBackground(() => {
  chrome.runtime.onMessage.addListener((msg: any, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
    if (msg.type === 'PROSPECT_DETECTED') {
      const first = (msg.names as string[]).find(n => n.length > 1);
      if (first) {
        chrome.storage.session.set({
          detectedProspect: { name: first },
          pendingPlatform: msg.platform ?? 'meet',
        });
      }
      sendResponse({ ok: true });
      return;
    }

    if (msg.type === 'POPUP_START_REQUEST') {
      // User clicked Start Call — kick off capture on last active tab
      chrome.tabs.query({ active: true, lastFocusedWindow: true }).then(([tab]: chrome.tabs.Tab[]) => {
        if (tab?.id != null) {
          activeTabId = tab.id;
          startCapture(() => sendResponse({ ok: true }));
        }
      });
      return true;
    }

    if (msg.type === 'STOP_CAPTURE') {
      stopCapture();
      sendResponse({ ok: true });
      return;
    }

    if (msg.type === 'OCTAMEM_QUERY') {
      // Popup can't hit the server directly with auth headers from popup context in some setups —
      // simplest is to GET through a Fastify proxy or call directly. For self-hosted, direct fetch works.
      queryOctaMem(msg.prospect as Prospect).then(context => sendResponse({ context })).catch(() => sendResponse({ context: null }));
      return true;
    }
  });
});

async function queryOctaMem(prospect: Prospect): Promise<string | null> {
  if (!prospect?.name) return null;
  try {
    const base = __WS_URL__.replace(/^ws/, 'http');
    const res = await fetch(`${base}/api/octamem/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prospect }),
    });
    if (!res.ok) return null;
    const data = await res.json() as { context: string | null };
    return data.context;
  } catch { return null; }
}

function startCapture(sendResponse: (r: unknown) => void): void {
  chrome.tabCapture.capture({ audio: true, video: false }, (stream: MediaStream | null) => {
    if (!stream) {
      sendResponse({ error: chrome.runtime.lastError?.message ?? 'capture failed' });
      return;
    }
    connectWs(stream);
    sendResponse({ ok: true });
  });
}

async function connectWs(stream: MediaStream): Promise<void> {
  const stored = await chrome.storage.session.get(['pendingProspect', 'pendingCallType', 'pendingPlatform']) as Record<string, any>;
  const prospect: Prospect = stored.pendingProspect ?? { name: 'Unknown' };
  const callType: CallType = stored.pendingCallType ?? 'enterprise';
  const platform: 'meet' | 'zoom' | 'teams' = stored.pendingPlatform ?? 'meet';

  const ws = new WebSocket(WS_URL);
  wsocket = ws;

  ws.onopen = () => {
    reconnectAttempt = 0;
    const startMsg: ClientMessage = { type: 'start', platform, callType, prospect };
    ws.send(JSON.stringify(startMsg));
    startRecorder(stream, ws);
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data as string) as ServerMessage;
      if (activeTabId !== null) {
        chrome.tabs.sendMessage(activeTabId, msg).catch(() => {});
      }
      if (msg.type === 'summary') {
        chrome.storage.session.set({ latestSummary: msg.summary, popupView: 'post' });
      }
    } catch { /* ignore */ }
  };

  ws.onerror = (err) => console.error('[SIGNAL] WS error:', err);

  ws.onclose = () => {
    stopRecorder();
    if (reconnectAttempt < MAX_RECONNECT_ATTEMPTS) {
      const delay = RECONNECT_DELAYS[reconnectAttempt] ?? 4000;
      reconnectAttempt++;
      setTimeout(() => { void connectWs(stream); }, delay);
    }
  };
}

function startRecorder(stream: MediaStream, ws: WebSocket): void {
  const mimeType = 'audio/webm;codecs=opus';
  if (!MediaRecorder.isTypeSupported(mimeType)) return;
  const rec = new MediaRecorder(stream, { mimeType });
  recorder = rec;
  rec.ondataavailable = (e) => {
    if (e.data.size > 0 && ws.readyState === WebSocket.OPEN) {
      void e.data.arrayBuffer().then(buf => ws.send(buf));
    }
  };
  rec.start(250);
}

function stopRecorder(): void {
  if (recorder?.state !== 'inactive') recorder?.stop();
  recorder = null;
}

function stopCapture(): void {
  stopRecorder();
  if (wsocket) {
    wsocket.send(JSON.stringify({ type: 'stop' } satisfies ClientMessage));
    wsocket.close();
    wsocket = null;
  }
}
