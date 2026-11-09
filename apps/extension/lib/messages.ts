import type { ClientMessage, ServerMessage } from '@signal/types';

/** background → offscreen document */
export type OffscreenCommand =
  | {
      target: 'offscreen';
      type: 'OFFSCREEN_START';
      streamId: string;
      url: string;
      startMessage: Extract<ClientMessage, { type: 'start' }>;
    }
  | { target: 'offscreen'; type: 'OFFSCREEN_STOP' };

/** offscreen document → background */
export type OffscreenEvent =
  | { target: 'background'; type: 'SERVER_MESSAGE'; msg: ServerMessage }
  | { target: 'background'; type: 'CAPTURE_ENDED'; reason: 'stopped' | 'connection-lost' };

export type StartCaptureResult = { ok: true } | { ok: false; error: string };
