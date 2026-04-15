import type { ClientMessage, ServerMessage, Prospect, CallType } from '@signal/types';

declare const __WS_URL__: string;

const WS_URL = (typeof __WS_URL__ !== 'undefined' ? __WS_URL__ : 'ws://localhost:8080') + '/ws';
const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAYS = [1000, 2000, 4000] as const;

let wsocket: WebSocket | null = null;
let recorder: MediaRecorder | null = null;
let frameInterval: ReturnType<typeof setInterval> | null = null;
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
  // Capture both audio and video so we can extract frames for Hume AI face analysis.
  // Video capture may be denied on some platforms — we fall back to audio-only.
  chrome.tabCapture.capture({ audio: true, video: true }, (stream: MediaStream | null) => {
    if (!stream) {
      // Fallback: audio-only (Hume face analysis will be unavailable)
      chrome.tabCapture.capture({ audio: true, video: false }, (audioStream: MediaStream | null) => {
        if (!audioStream) {
          sendResponse({ error: chrome.runtime.lastError?.message ?? 'capture failed' });
          return;
        }
        connectWs(audioStream);
        sendResponse({ ok: true });
      });
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
    startVideoFramer(stream, ws);
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

function startVideoFramer(stream: MediaStream, ws: WebSocket): void {
  const videoTrack = stream.getVideoTracks()[0];
  if (!videoTrack) return; // audio-only fallback — no video available

  // ImageCapture API: grab still frames from the live video track.
  // OffscreenCanvas downscales to 640×360 to keep payload small (~15–30 KB/frame).
  const imageCapture = new ImageCapture(videoTrack);
  const FRAME_INTERVAL_MS = 4000;
  const TARGET_WIDTH = 640;
  const TARGET_HEIGHT = 360;

  frameInterval = setInterval(async () => {
    if (ws.readyState !== WebSocket.OPEN) return;
    try {
      const bitmap = await imageCapture.grabFrame();
      const scale = Math.min(TARGET_WIDTH / bitmap.width, TARGET_HEIGHT / bitmap.height, 1);
      const w = Math.round(bitmap.width * scale);
      const h = Math.round(bitmap.height * scale);
      const canvas = new OffscreenCanvas(w, h);
      const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
      ctx.drawImage(bitmap, 0, 0, w, h);
      bitmap.close();
      const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.65 });
      const buffer = await blob.arrayBuffer();
      // btoa over chunked bytes to avoid call-stack overflow on large frames
      const bytes = new Uint8Array(buffer);
      let binary = '';
      const CHUNK = 8192;
      for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
      }
      const base64 = btoa(binary);
      ws.send(JSON.stringify({ type: 'video_frame', data: base64 } satisfies ClientMessage));
    } catch {
      // Track ended or permission revoked — clear the interval
      stopVideoFramer();
    }
  }, FRAME_INTERVAL_MS);
}

function stopVideoFramer(): void {
  if (frameInterval !== null) { clearInterval(frameInterval); frameInterval = null; }
}

function stopRecorder(): void {
  if (recorder?.state !== 'inactive') recorder?.stop();
  recorder = null;
}

function stopCapture(): void {
  stopRecorder();
  stopVideoFramer();
  if (wsocket) {
    wsocket.send(JSON.stringify({ type: 'stop' } satisfies ClientMessage));
    wsocket.close();
    wsocket = null;
  }
}
