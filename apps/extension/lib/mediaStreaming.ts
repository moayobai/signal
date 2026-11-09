import type { ClientMessage } from '@signal/types';
import { SOCKET_OPEN, type SocketLike } from './captureSession';

const AUDIO_MIME_TYPE = 'audio/webm;codecs=opus';
const FRAME_INTERVAL_MS = 4000;
const TARGET_WIDTH = 640;
const TARGET_HEIGHT = 360;

/** btoa over chunked bytes to avoid call-stack overflow on large frames. */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * Streams opus audio chunks over the socket. Only the audio tracks are handed to
 * MediaRecorder — an audio-only mimeType with a video track in the stream fails.
 */
export function startRecorder(stream: MediaStream, ws: SocketLike): () => void {
  const audioTracks = stream.getAudioTracks();
  if (audioTracks.length === 0 || !MediaRecorder.isTypeSupported(AUDIO_MIME_TYPE)) return () => {};
  const rec = new MediaRecorder(new MediaStream(audioTracks), { mimeType: AUDIO_MIME_TYPE });
  rec.ondataavailable = (e) => {
    if (e.data.size > 0 && ws.readyState === SOCKET_OPEN) {
      void e.data.arrayBuffer().then(buf => {
        if (ws.readyState === SOCKET_OPEN) ws.send(buf);
      });
    }
  };
  rec.start(250);
  return () => {
    rec.ondataavailable = null;
    if (rec.state !== 'inactive') rec.stop();
  };
}

/** Sends a downscaled JPEG of the tab every few seconds for face analysis. */
export function startVideoFramer(stream: MediaStream, ws: SocketLike): () => void {
  const videoTrack = stream.getVideoTracks()[0];
  if (!videoTrack) return () => {}; // audio-only fallback — no video available

  const imageCapture = new ImageCapture(videoTrack);
  let busy = false;
  const interval = setInterval(async () => {
    if (busy || ws.readyState !== SOCKET_OPEN) return;
    busy = true;
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
      const base64 = bytesToBase64(new Uint8Array(await blob.arrayBuffer()));
      if (ws.readyState === SOCKET_OPEN) {
        ws.send(JSON.stringify({ type: 'video_frame', data: base64 } satisfies ClientMessage));
      }
    } catch {
      // Track ended or permission revoked — stop sampling.
      clearInterval(interval);
    } finally {
      busy = false;
    }
  }, FRAME_INTERVAL_MS);
  return () => clearInterval(interval);
}
