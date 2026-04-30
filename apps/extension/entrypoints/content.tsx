import ReactDOM from 'react-dom/client';
import { createShadowRootUi } from 'wxt/client';
import { Overlay } from '../overlay/Overlay';
import { useSignalStore } from '../overlay/store';
import type { ServerMessage } from '@signal/types';

const PLATFORM_SELECTORS = {
  meet: '.zWGUib',
  zoom: '.participants-entry__name',
  teams: '[data-tid="roster-participant"]',
} as const;

function currentPlatform(): keyof typeof PLATFORM_SELECTORS | null {
  const h = location.hostname;
  if (h.includes('meet.google.com')) return 'meet';
  if (h.includes('zoom.us')) return 'zoom';
  if (h.includes('teams.microsoft.com')) return 'teams';
  return null;
}

function scrapeNames(platform: keyof typeof PLATFORM_SELECTORS): string[] {
  const sel = PLATFORM_SELECTORS[platform];
  const nodes = document.querySelectorAll<HTMLElement>(sel);
  const names = new Set<string>();
  nodes.forEach(n => {
    const t = n.textContent?.trim();
    if (t && t.length > 1 && t.length < 80) names.add(t);
  });
  return [...names];
}

export default defineContentScript({
  matches: ['*://meet.google.com/*', '*://*.zoom.us/wc/*', '*://teams.microsoft.com/*'],
  cssInjectionMode: 'ui',

  async main(ctx) {
    const ui = await createShadowRootUi(ctx, {
      name: 'signal-overlay',
      position: 'overlay',
      anchor: 'body',
      onMount(container, _shadow, shadowHost) {
        // New HUD: overlay children pin themselves via position: fixed, so the
        // host fills the viewport and lets clicks pass through by default.
        // Individual panels opt into pointerEvents: auto on themselves.
        Object.assign(shadowHost.style, {
          position: 'fixed',
          inset: '0',
          zIndex: '2147483647',
          pointerEvents: 'none',
        });
        container.style.pointerEvents = 'none';
        const root = ReactDOM.createRoot(container);
        root.render(<Overlay useMockFixture={false} />);
        return root;
      },
      onRemove(root) {
        root?.unmount();
      },
    });
    ui.mount();

    // Prospect detection via DOM scrape
    const platform = currentPlatform();
    if (platform) {
      const notify = () => {
        const names = scrapeNames(platform);
        if (names.length > 0) {
          chrome.runtime
            .sendMessage({ type: 'PROSPECT_DETECTED', platform, names })
            .catch(() => {});
        }
      };
      notify();
      const observer = new MutationObserver(() => notify());
      observer.observe(document.body, { childList: true, subtree: true });
      ctx.onInvalidated(() => observer.disconnect());
    }

    // START_CAPTURE fires only after popup sends "pending" prospect (handled via background).
    // Legacy auto-start kept as a dev fallback — background ignores it if prospect unavailable.
    chrome.runtime.sendMessage({ type: 'CONTENT_READY', platform }).catch(() => {});

    chrome.runtime.onMessage.addListener((msg: ServerMessage) => {
      const store = useSignalStore.getState();
      switch (msg.type) {
        case 'frame':
          store.setFrame(msg.frame);
          break;
        case 'transcript':
          store.appendTranscriptLine(msg.line);
          break;
        case 'state':
          store.setOverlayState(msg.overlayState);
          break;
        case 'connected':
          store.setOverlayState('LIVE');
          break;
        case 'summary':
          chrome.storage.session.set({ latestSummary: msg.summary, popupView: 'post' });
          store.setOverlayState('POSTCALL');
          break;
        case 'error':
          console.error('[SIGNAL] Server error:', msg.message);
          break;
      }
    });
  },
});
