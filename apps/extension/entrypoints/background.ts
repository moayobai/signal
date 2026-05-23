import type { ClientMessage, ServerMessage, Prospect, CallType } from '@signal/types';
import { shouldReconnectAfterClose, stopMediaStreamTracks } from '../lib/captureLifecycle';
import {
  authHeaders,
  authenticatedWsProtocols,
  DEFAULT_SIGNAL_SERVER_URL,
  readSignalConnectionConfig,
  type SignalConnectionConfig,
  wsUrlFromServerUrl,
} from '../lib/connectionConfig';

declare const __WS_URL__: string;
declare const __SIGNAL_AUTH_TOKEN__: string;

const WS_URL = (typeof __WS_URL__ !== 'undefined' ? __WS_URL__ : 'ws://localhost:8080') + '/ws';
const SIGNAL_AUTH_TOKEN = typeof __SIGNAL_AUTH_TOKEN__ !== 'undefined' ? __SIGNAL_AUTH_TOKEN__ : '';
const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAYS = [1000, 2000, 4000] as const;
const STOP_SUMMARY_TIMEOUT_MS = 15_000;

let wsocket: WebSocket | null = null;
let recorder: MediaRecorder | null = null;
let frameInterval: ReturnType<typeof setInterval> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let pendingStopCloseTimer: ReturnType<typeof setTimeout> | null = null;
let activeStream: MediaStream | null = null;
let activeTabId: number | null = null;
let reconnectAttempt = 0;
let intentionalStop = false;
let captureState: 'idle' | 'starting' | 'active' | 'stopping' = 'idle';

const DEFAULT_CONNECTION: SignalConnectionConfig = {
  serverUrl: DEFAULT_SIGNAL_SERVER_URL,
  authToken: SIGNAL_AUTH_TOKEN,
};

function isProspect(value: unknown): value is Prospect {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { name?: unknown }).name === 'string'
  );
}

function isCallType(value: unknown): value is CallType {
  return value === 'investor' || value === 'enterprise' || value === 'bd' || value === 'customer';
}

function isPlatform(value: unknown): value is 'meet' | 'zoom' | 'teams' {
  return value === 'meet' || value === 'zoom' || value === 'teams';
}

try {
  DEFAULT_CONNECTION.serverUrl = new URL(WS_URL).origin;
} catch {
  DEFAULT_CONNECTION.serverUrl = DEFAULT_SIGNAL_SERVER_URL;
}

export default defineBackground(() => {
  chrome.runtime.onMessage.addListener(
    (msg: any, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
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
        chrome.tabs
          .query({ active: true, lastFocusedWindow: true })
          .then(([tab]: chrome.tabs.Tab[]) => {
            if (tab?.id != null) {
              activeTabId = tab.id;
              startCapture(sendResponse);
            } else {
              sendResponse({ error: 'No active tab to capture' });
            }
          })
          .catch(() => sendResponse({ error: 'Unable to find active tab' }));
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
        queryOctaMem(msg.prospect as Prospect)
          .then(context => sendResponse({ context }))
          .catch(() => sendResponse({ context: null }));
        return true;
      }

      if (msg.type === 'NEXT_MEETING') {
        fetchNextMeeting()
          .then(meeting => sendResponse({ meeting }))
          .catch(() => sendResponse({ meeting: null }));
        return true;
      }
    },
  );
});

interface NextMeetingResponse {
  id: string;
  provider: 'google' | 'outlook';
  title: string;
  startTime: number;
  endTime: number;
  attendees: Array<{ email: string; name?: string; isOrganizer?: boolean }>;
  meetingLink?: string | null;
}

async function fetchNextMeeting(): Promise<NextMeetingResponse | null> {
  try {
    const config = await readSignalConnectionConfig(DEFAULT_CONNECTION);
    const res = await fetch(`${config.serverUrl}/api/calendar/next`, {
      headers: authHeaders(config.authToken),
    });
    if (!res.ok) return null;
    return (await res.json()) as NextMeetingResponse | null;
  } catch {
    return null;
  }
}

async function queryOctaMem(prospect: Prospect): Promise<string | null> {
  if (!prospect?.name) return null;
  try {
    const config = await readSignalConnectionConfig(DEFAULT_CONNECTION);
    const res = await fetch(`${config.serverUrl}/api/octamem/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders(config.authToken) },
      body: JSON.stringify({ prospect }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { context: string | null };
    return data.context;
  } catch {
    return null;
  }
}

function startCapture(sendResponse: (r: unknown) => void): void {
  if (captureState !== 'idle') {
    sendResponse({ error: 'Capture already running' });
    return;
  }
  captureState = 'starting';
  intentionalStop = false;
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  clearPendingStopCloseTimer();
  readSignalConnectionConfig(DEFAULT_CONNECTION)
    .then(config => {
      if (!config.authToken.trim()) {
        captureState = 'idle';
        sendResponse({ error: 'Connection auth token is required' });
        return;
      }
      // Capture both audio and video so we can extract frames for Hume AI face analysis.
      // Video capture may be denied on some platforms; we fall back to audio-only.
      chrome.tabCapture.capture({ audio: true, video: true }, (stream: MediaStream | null) => {
        if (!stream) {
          // Fallback: audio-only (Hume face analysis will be unavailable)
          chrome.tabCapture.capture(
            { audio: true, video: false },
            (audioStream: MediaStream | null) => {
              if (!audioStream) {
                captureState = 'idle';
                sendResponse({ error: chrome.runtime.lastError?.message ?? 'capture failed' });
                return;
              }
              if (intentionalStop || captureState !== 'starting') {
                stopMediaStreamTracks(audioStream);
                captureState = 'idle';
                sendResponse({ error: 'Capture stopped before it started' });
                return;
              }
              activeStream = audioStream;
              captureState = 'active';
              void connectWs(audioStream, config);
              sendResponse({ ok: true });
            },
          );
          return;
        }
        if (intentionalStop || captureState !== 'starting') {
          stopMediaStreamTracks(stream);
          captureState = 'idle';
          sendResponse({ error: 'Capture stopped before it started' });
          return;
        }
        activeStream = stream;
        captureState = 'active';
        void connectWs(stream, config);
        sendResponse({ ok: true });
      });
    })
    .catch(() => {
      captureState = 'idle';
      sendResponse({ error: 'Invalid connection settings' });
    });
}

async function connectWs(stream: MediaStream, config: SignalConnectionConfig): Promise<void> {
  let stored: Record<string, unknown>;
  try {
    stored = (await chrome.storage.session.get([
      'pendingProspect',
      'pendingCallType',
      'pendingPlatform',
    ])) as Record<string, any>;
  } catch {
    captureState = 'idle';
    stopMediaStreamTracks(stream);
    return;
  }
  const prospect: Prospect = isProspect(stored.pendingProspect)
    ? stored.pendingProspect
    : { name: 'Unknown' };
  const callType: CallType = isCallType(stored.pendingCallType)
    ? stored.pendingCallType
    : 'enterprise';
  const platform: 'meet' | 'zoom' | 'teams' = isPlatform(stored.pendingPlatform)
    ? stored.pendingPlatform
    : 'meet';

  if (intentionalStop) return;

  const ws = new WebSocket(
    wsUrlFromServerUrl(config.serverUrl),
    authenticatedWsProtocols(config.authToken),
  );
  wsocket = ws;

  ws.onopen = () => {
    reconnectAttempt = 0;
    const startMsg: ClientMessage = { type: 'start', platform, callType, prospect };
    ws.send(JSON.stringify(startMsg));
    startRecorder(stream, ws);
    startVideoFramer(stream, ws);
  };

  ws.onmessage = event => {
    try {
      const msg = JSON.parse(event.data as string) as ServerMessage;
      if (activeTabId !== null) {
        chrome.tabs.sendMessage(activeTabId, msg).catch(() => {});
      }
      if (msg.type === 'summary') {
        chrome.storage.session.set({ latestSummary: msg.summary, popupView: 'post' });
        closeSocketAfterStop(250);
      }
      if (msg.type === 'state' && msg.overlayState === 'POSTCALL') {
        closeSocketAfterStop(250);
      }
    } catch {
      /* ignore */
    }
  };

  ws.onerror = err => console.error('[SIGNAL] WS error:', err);

  ws.onclose = () => {
    if (wsocket === ws) wsocket = null;
    clearPendingStopCloseTimer();
    stopRecorder();
    stopVideoFramer();
    if (
      shouldReconnectAfterClose({
        intentionalStop,
        reconnectAttempt,
        maxReconnectAttempts: MAX_RECONNECT_ATTEMPTS,
      })
    ) {
      const delay = RECONNECT_DELAYS[reconnectAttempt] ?? 4000;
      reconnectAttempt++;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        void connectWs(stream, config);
      }, delay);
    }
    if (!wsocket && captureState !== 'starting') captureState = 'idle';
  };
}

function startRecorder(stream: MediaStream, ws: WebSocket): void {
  const mimeType = 'audio/webm;codecs=opus';
  if (!MediaRecorder.isTypeSupported(mimeType)) return;
  const rec = new MediaRecorder(stream, { mimeType });
  recorder = rec;
  rec.ondataavailable = e => {
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
  if (frameInterval !== null) {
    clearInterval(frameInterval);
    frameInterval = null;
  }
}

function stopRecorder(): void {
  if (recorder?.state !== 'inactive') recorder?.stop();
  recorder = null;
}

function stopMediaStream(): void {
  stopMediaStreamTracks(activeStream);
  activeStream = null;
}

function clearPendingStopCloseTimer(): void {
  if (pendingStopCloseTimer !== null) {
    clearTimeout(pendingStopCloseTimer);
    pendingStopCloseTimer = null;
  }
}

function closeSocketAfterStop(delayMs: number): void {
  clearPendingStopCloseTimer();
  pendingStopCloseTimer = setTimeout(() => {
    pendingStopCloseTimer = null;
    wsocket?.close();
    wsocket = null;
    if (captureState === 'stopping') captureState = 'idle';
  }, delayMs);
}

function stopCapture(): void {
  intentionalStop = true;
  if (captureState === 'idle') return;
  captureState = 'stopping';
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  stopRecorder();
  stopVideoFramer();
  if (wsocket) {
    if (wsocket.readyState === WebSocket.OPEN) {
      wsocket.send(JSON.stringify({ type: 'stop' } satisfies ClientMessage));
      closeSocketAfterStop(STOP_SUMMARY_TIMEOUT_MS);
    } else {
      wsocket.close();
      wsocket = null;
    }
  }
  stopMediaStream();
  captureState = wsocket ? 'stopping' : 'idle';
}
