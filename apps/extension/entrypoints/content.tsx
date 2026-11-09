import ReactDOM from 'react-dom/client';
import { createShadowRootUi } from 'wxt/client';
import { Overlay } from '../overlay/Overlay';
import { createOverlayMessageHandler } from '../overlay/serverMessages';
import { createProspectNotifier } from '../lib/prospectNotifier';
import { platformFromHostname, type Platform } from '../lib/platform';
import type { ServerMessage } from '@signal/types';

const PLATFORM_SELECTORS: Record<Platform, string> = {
  meet:  '.zWGUib',
  zoom:  '.participants-entry__name',
  teams: '[data-tid="roster-participant"]',
};

function currentPlatform(): Platform | null {
  return platformFromHostname(location.hostname);
}

function scrapeNames(platform: Platform): string[] {
  const sel = PLATFORM_SELECTORS[platform];
  const nodes = document.querySelectorAll<HTMLElement>(sel);
  const names = new Set<string>();
  nodes.forEach(n => { const t = n.textContent?.trim(); if (t && t.length > 1 && t.length < 80) names.add(t); });
  return [...names];
}

export default defineContentScript({
  matches: [
    '*://meet.google.com/*',
    '*://*.zoom.us/wc/*',
    '*://teams.microsoft.com/*',
  ],
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
      onRemove(root) { root?.unmount(); },
    });
    ui.mount();

    // Prospect detection via DOM scrape
    const platform = currentPlatform();
    if (platform) {
      const notifier = createProspectNotifier(
        () => scrapeNames(platform),
        (names) => { chrome.runtime.sendMessage({ type: 'PROSPECT_DETECTED', platform, names }).catch(() => {}); },
      );
      notifier.flush();
      const observer = new MutationObserver(() => notifier.schedule());
      observer.observe(document.body, { childList: true, subtree: true });
      ctx.onInvalidated(() => { observer.disconnect(); notifier.dispose(); });
    }

    const handler = createOverlayMessageHandler();
    const onMessage = (msg: ServerMessage) => handler.handle(msg);
    chrome.runtime.onMessage.addListener(onMessage);
    ctx.onInvalidated(() => {
      chrome.runtime.onMessage.removeListener(onMessage);
      handler.dispose();
    });
  },
});
