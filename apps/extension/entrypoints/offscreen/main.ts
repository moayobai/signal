/**
 * Offscreen document — owns the tab MediaStream, MediaRecorder and the server
 * WebSocket. MV3 service workers have no tabCapture.capture / MediaRecorder /
 * AudioContext, so all media work has to live here.
 */
import { createCaptureSession, type CaptureSession } from '../../lib/captureSession';
import { stopMediaStreamTracks } from '../../lib/captureLifecycle';
import { startRecorder, startVideoFramer } from '../../lib/mediaStreaming';
import type { OffscreenCommand, OffscreenEvent, StartCaptureResult } from '../../lib/messages';

let session: CaptureSession | null = null;
let stream: MediaStream | null = null;
let playback: AudioContext | null = null;

function emit(event: OffscreenEvent): void {
  chrome.runtime.sendMessage(event).catch(() => {});
}

function tabConstraint(streamId: string): MediaTrackConstraints {
  // Chrome-specific constraint shape for tab capture streams.
  return { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } } as MediaTrackConstraints;
}

async function openTabStream(streamId: string): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: tabConstraint(streamId),
      video: tabConstraint(streamId),
    });
  } catch {
    // Video may be unavailable — fall back to audio-only (no face analysis).
    return navigator.mediaDevices.getUserMedia({ audio: tabConstraint(streamId) });
  }
}

function releaseMedia(): void {
  stopMediaStreamTracks(stream);
  stream = null;
  playback?.close().catch(() => {});
  playback = null;
}

async function start(cmd: Extract<OffscreenCommand, { type: 'OFFSCREEN_START' }>): Promise<StartCaptureResult> {
  // Detach before aborting so the superseded session doesn't report CAPTURE_ENDED.
  const previous = session;
  session = null;
  previous?.abort();
  releaseMedia();

  const s = await openTabStream(cmd.streamId);
  stream = s;

  // Capturing a tab mutes it for the user — route the audio back to the speakers
  // so they can still hear the other side of the call.
  playback = new AudioContext();
  playback.createMediaStreamSource(s).connect(playback.destination);

  const current: CaptureSession = createCaptureSession({
    url: cmd.url,
    startMessage: cmd.startMessage,
    createSocket: (url) => {
      const ws = new WebSocket(url);
      ws.binaryType = 'arraybuffer';
      return ws;
    },
    startMedia: (ws) => {
      const stopRecorder = startRecorder(s, ws);
      const stopFramer = startVideoFramer(s, ws);
      return () => { stopRecorder(); stopFramer(); };
    },
    onServerMessage: (msg) => emit({ target: 'background', type: 'SERVER_MESSAGE', msg }),
    onEnded: (reason) => {
      if (session !== current) return;
      session = null;
      releaseMedia();
      emit({ target: 'background', type: 'CAPTURE_ENDED', reason });
    },
  });
  session = current;

  // The user can end tab sharing from Chrome's UI — treat that as a stop.
  s.getAudioTracks()[0]?.addEventListener('ended', () => {
    if (session === current) current.stop();
  });

  return { ok: true };
}

chrome.runtime.onMessage.addListener((msg: OffscreenCommand, _sender, sendResponse: (r: StartCaptureResult) => void) => {
  if (msg?.target !== 'offscreen') return;
  if (msg.type === 'OFFSCREEN_START') {
    start(msg)
      .then(sendResponse)
      .catch((err: unknown) => {
        releaseMedia();
        sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) });
      });
    return true;
  }
  if (msg.type === 'OFFSCREEN_STOP') {
    if (session) session.stop();
    else emit({ target: 'background', type: 'CAPTURE_ENDED', reason: 'stopped' });
    sendResponse({ ok: true });
  }
});
