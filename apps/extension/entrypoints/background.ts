import type { Prospect, CallType, ServerMessage } from '@signal/types';
import { httpBaseFromWsUrl } from '../lib/captureSession';
import type { OffscreenCommand, OffscreenEvent, StartCaptureResult } from '../lib/messages';
import { platformFromUrl } from '../lib/platform';
import { viewAfterCaptureEnded, type StoredPopupState } from '../lib/popupState';

declare const __WS_URL__: string;
declare const __SIGNAL_AUTH_TOKEN__: string;

const WS_BASE = typeof __WS_URL__ !== 'undefined' ? __WS_URL__ : 'ws://localhost:8080';
const WS_URL = WS_BASE.replace(/\/+$/, '') + '/ws';
const HTTP_BASE = httpBaseFromWsUrl(WS_BASE);
const SIGNAL_AUTH_TOKEN = typeof __SIGNAL_AUTH_TOKEN__ !== 'undefined' ? __SIGNAL_AUTH_TOKEN__ : '';
const OFFSCREEN_PATH = 'offscreen.html';

export default defineBackground(() => {
  chrome.runtime.onMessage.addListener((msg: any, _sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
    // Commands addressed to the offscreen document also reach us — ignore them.
    if (msg?.target === 'offscreen') return;

    if (msg?.target === 'background') {
      void handleOffscreenEvent(msg as OffscreenEvent);
      return;
    }

    if (msg.type === 'PROSPECT_DETECTED') {
      const first = (msg.names as string[]).find(n => n.length > 1);
      if (first) {
        chrome.storage.session.set({ detectedProspect: { name: first } });
      }
      sendResponse({ ok: true });
      return;
    }

    if (msg.type === 'POPUP_START_REQUEST') {
      chrome.tabs.query({ active: true, lastFocusedWindow: true })
        .then(([tab]: chrome.tabs.Tab[]) => {
          if (tab?.id == null) return { ok: false, error: 'No active tab to capture' } as StartCaptureResult;
          return startCapture(tab);
        })
        .catch((err: unknown) => ({ ok: false, error: errorMessage(err) }) as StartCaptureResult)
        .then(sendResponse);
      return true;
    }

    if (msg.type === 'STOP_CAPTURE') {
      stopCapture().then(() => sendResponse({ ok: true }), () => sendResponse({ ok: true }));
      return true;
    }

    if (msg.type === 'OCTAMEM_QUERY') {
      queryOctaMem(msg.prospect as Prospect).then(context => sendResponse({ context })).catch(() => sendResponse({ context: null }));
      return true;
    }

    if (msg.type === 'NEXT_MEETING') {
      fetchNextMeeting().then(meeting => sendResponse({ meeting })).catch(() => sendResponse({ meeting: null }));
      return true;
    }
  });
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
    const res = await fetch(`${HTTP_BASE}/api/calendar/next`, { headers: authHeaders() });
    if (!res.ok) return null;
    return await res.json() as NextMeetingResponse | null;
  } catch { return null; }
}

async function queryOctaMem(prospect: Prospect): Promise<string | null> {
  if (!prospect?.name) return null;
  try {
    const res = await fetch(`${HTTP_BASE}/api/octamem/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ prospect }),
    });
    if (!res.ok) return null;
    const data = await res.json() as { context: string | null };
    return data.context;
  } catch { return null; }
}

function authHeaders(): Record<string, string> {
  return SIGNAL_AUTH_TOKEN ? { Authorization: `Bearer ${SIGNAL_AUTH_TOKEN}` } : {};
}

function authenticatedWsUrl(): string {
  if (!SIGNAL_AUTH_TOKEN) return WS_URL;
  const url = new URL(WS_URL);
  url.searchParams.set('token', SIGNAL_AUTH_TOKEN);
  return url.toString();
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

let creatingOffscreen: Promise<void> | null = null;

async function hasOffscreenDocument(): Promise<boolean> {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
  });
  return contexts.length > 0;
}

async function ensureOffscreenDocument(): Promise<void> {
  if (await hasOffscreenDocument()) return;
  creatingOffscreen ??= chrome.offscreen.createDocument({
    url: OFFSCREEN_PATH,
    reasons: [chrome.offscreen.Reason.USER_MEDIA],
    justification: 'Capture call audio/video from the meeting tab and stream it to the SIGNAL server.',
  }).finally(() => { creatingOffscreen = null; });
  await creatingOffscreen;
}

async function startCapture(tab: chrome.tabs.Tab): Promise<StartCaptureResult> {
  const tabId = tab.id!;
  // A tab can only have one active capture — tear down any previous call first.
  if (await hasOffscreenDocument()) await chrome.offscreen.closeDocument();

  const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
  const stored = await chrome.storage.session.get(['pendingProspect', 'pendingCallType']) as Record<string, any>;
  const prospect: Prospect = stored.pendingProspect ?? { name: 'Unknown' };
  const callType: CallType = stored.pendingCallType ?? 'enterprise';
  const platform = platformFromUrl(tab.url) ?? 'meet';

  await ensureOffscreenDocument();
  const command: OffscreenCommand = {
    target: 'offscreen',
    type: 'OFFSCREEN_START',
    streamId,
    url: authenticatedWsUrl(),
    startMessage: { type: 'start', platform, callType, prospect },
  };
  const result = await chrome.runtime.sendMessage(command) as StartCaptureResult | undefined;
  if (!result?.ok) return result ?? { ok: false, error: 'Capture did not start' };

  await chrome.storage.session.remove(['latestSummary']);
  await chrome.storage.session.set({ captureActive: true, activeTabId: tabId, popupView: 'live' });
  return { ok: true };
}

async function stopCapture(): Promise<void> {
  if (await hasOffscreenDocument()) {
    await chrome.runtime.sendMessage({ target: 'offscreen', type: 'OFFSCREEN_STOP' } satisfies OffscreenCommand);
  } else {
    await chrome.storage.session.set({ captureActive: false });
  }
}

async function sendToActiveTab(msg: ServerMessage): Promise<void> {
  const { activeTabId } = await chrome.storage.session.get('activeTabId') as { activeTabId?: number };
  if (activeTabId != null) {
    await chrome.tabs.sendMessage(activeTabId, msg).catch(() => {});
  }
}

async function handleOffscreenEvent(event: OffscreenEvent): Promise<void> {
  if (event.type === 'SERVER_MESSAGE') {
    const msg = event.msg;
    if (msg.type === 'summary') {
      await chrome.storage.session.set({ latestSummary: msg.summary, popupView: 'post' });
    }
    await sendToActiveTab(msg);
    return;
  }

  if (event.type === 'CAPTURE_ENDED') {
    const stored = await chrome.storage.session.get(['latestSummary', 'popupView']) as StoredPopupState;
    const view = viewAfterCaptureEnded(stored);
    await chrome.storage.session.set({ captureActive: false, popupView: view });
    // No summary arrived (connection lost / timed out) — don't leave the HUD stuck on LIVE.
    if (view !== 'post') await sendToActiveTab({ type: 'state', overlayState: 'IDLE' });
    if (await hasOffscreenDocument()) await chrome.offscreen.closeDocument().catch(() => {});
  }
}
