import type { ClientMessage, ServerMessage } from '@signal/types';
import { shouldReconnectAfterClose } from './captureLifecycle';

/** Minimal WebSocket surface we depend on — lets tests inject a fake. */
export interface SocketLike {
  readonly readyState: number;
  send(data: string | ArrayBuffer): void;
  close(): void;
  // `any` params keep the real DOM WebSocket assignable to this interface.
  onopen: ((ev: any) => void) | null;
  onmessage: ((ev: any) => void) | null;
  onerror: ((ev: any) => void) | null;
  onclose: ((ev: any) => void) | null;
}

export const SOCKET_OPEN = 1;

export interface CaptureSessionOptions {
  url: string;
  startMessage: Extract<ClientMessage, { type: 'start' }>;
  createSocket: (url: string) => SocketLike;
  /** Start streaming media over `socket`; returns a function that stops it. */
  startMedia: (socket: SocketLike) => () => void;
  onServerMessage: (msg: ServerMessage) => void;
  /** Fired exactly once when the session is fully over (stopped or gave up reconnecting). */
  onEnded: (reason: 'stopped' | 'connection-lost') => void;
  maxReconnectAttempts?: number;
  reconnectDelays?: readonly number[];
  /** How long to wait for the post-call summary after sending `stop`. */
  summaryTimeoutMs?: number;
}

export interface CaptureSession {
  /** Sends `stop`, waits for the summary (or timeout), then closes. */
  stop(): void;
  /** Tears everything down immediately without waiting for a summary. */
  abort(): void;
}

export function createCaptureSession(opts: CaptureSessionOptions): CaptureSession {
  const maxReconnectAttempts = opts.maxReconnectAttempts ?? 3;
  const reconnectDelays = opts.reconnectDelays ?? [1000, 2000, 4000];
  const summaryTimeoutMs = opts.summaryTimeoutMs ?? 60_000;

  let socket: SocketLike | null = null;
  let stopMedia: (() => void) | null = null;
  let reconnectAttempt = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let summaryTimer: ReturnType<typeof setTimeout> | null = null;
  let stopping = false;
  let ended = false;

  function haltMedia(): void {
    stopMedia?.();
    stopMedia = null;
  }

  function finish(reason: 'stopped' | 'connection-lost'): void {
    if (ended) return;
    ended = true;
    stopping = true;
    if (reconnectTimer !== null) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    if (summaryTimer !== null) { clearTimeout(summaryTimer); summaryTimer = null; }
    haltMedia();
    const s = socket;
    socket = null;
    s?.close();
    opts.onEnded(reason);
  }

  function connect(): void {
    if (ended || stopping) return;
    const ws = opts.createSocket(opts.url);
    socket = ws;

    ws.onopen = () => {
      if (socket !== ws || stopping) return;
      reconnectAttempt = 0;
      ws.send(JSON.stringify(opts.startMessage));
      haltMedia();
      stopMedia = opts.startMedia(ws);
    };

    ws.onmessage = (event: { data: unknown }) => {
      if (socket !== ws) return;
      let msg: ServerMessage;
      try {
        msg = JSON.parse(event.data as string) as ServerMessage;
      } catch {
        return;
      }
      opts.onServerMessage(msg);
      // The summary is the last thing the server sends for a stopped call.
      if (stopping && msg.type === 'summary') finish('stopped');
    };

    ws.onerror = () => { /* onclose follows and handles recovery */ };

    ws.onclose = () => {
      if (socket !== ws) return;
      socket = null;
      haltMedia();
      if (stopping) { finish('stopped'); return; }
      if (shouldReconnectAfterClose({ intentionalStop: false, reconnectAttempt, maxReconnectAttempts })) {
        const delay = reconnectDelays[reconnectAttempt] ?? reconnectDelays[reconnectDelays.length - 1] ?? 4000;
        reconnectAttempt++;
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          connect();
        }, delay);
      } else {
        finish('connection-lost');
      }
    };
  }

  connect();

  return {
    stop() {
      if (ended || stopping) return;
      stopping = true;
      haltMedia();
      if (reconnectTimer !== null) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      if (socket && socket.readyState === SOCKET_OPEN) {
        socket.send(JSON.stringify({ type: 'stop' } satisfies ClientMessage));
        summaryTimer = setTimeout(() => finish('stopped'), summaryTimeoutMs);
      } else {
        finish('stopped');
      }
    },
    abort() {
      finish('stopped');
    },
  };
}

/** Converts a WebSocket URL (ws/wss) to its HTTP(S) origin-preserving equivalent. */
export function httpBaseFromWsUrl(wsUrl: string): string {
  return wsUrl.replace(/^ws(s?):\/\//, 'http$1://').replace(/\/+$/, '');
}
