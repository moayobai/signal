import ReactDOM from 'react-dom/client';
import { createShadowRootUi } from 'wxt/client';
import { Overlay } from '../overlay/Overlay';
import { useSignalStore } from '../overlay/store';
import type { ServerMessage } from '@signal/types';

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
        Object.assign(shadowHost.style, {
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: '2147483647',
          pointerEvents: 'none',
          width: 'auto',
          height: 'auto',
        });
        container.style.pointerEvents = 'auto';

        const root = ReactDOM.createRoot(container);
        root.render(<Overlay useMockFixture={false} />);
        return root;
      },

      onRemove(root) {
        root?.unmount();
      },
    });

    ui.mount();

    // Trigger audio capture via background service worker
    chrome.runtime.sendMessage({ type: 'START_CAPTURE' }, (response) => {
      if (chrome.runtime.lastError) {
        console.warn('[SIGNAL] START_CAPTURE error:', chrome.runtime.lastError.message);
      } else if (response?.error) {
        console.warn('[SIGNAL] Capture failed:', response.error);
      }
    });

    // Listen for server messages relayed from background
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
        case 'error':
          console.error('[SIGNAL] Server error:', msg.message);
          break;
      }
    });
  },
});
