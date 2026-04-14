import ReactDOM from 'react-dom/client';
import { createShadowRootUi } from 'wxt/client';
import { Overlay } from '../overlay/Overlay';

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
        root.render(<Overlay useMockFixture={true} />);
        return root;
      },

      onRemove(root) {
        root?.unmount();
      },
    });

    ui.mount();
  },
});
