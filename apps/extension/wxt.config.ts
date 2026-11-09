import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

const WS_URL = process.env.WS_URL ?? 'ws://localhost:8080';
// Background fetches /api/* on the same host as the WebSocket server.
const SERVER_ORIGIN_PATTERN = `${new URL(WS_URL.replace(/^ws(s?):/, 'http$1:')).origin}/*`;

export default defineConfig({
  srcDir: '.',
  manifest: {
    name: 'SIGNAL',
    description: 'Real-time AI co-pilot for sales & investor calls',
    version: '0.1.0',
    permissions: ['tabs', 'storage', 'tabCapture', 'offscreen'],
    host_permissions: [
      '*://meet.google.com/*',
      '*://*.zoom.us/*',
      '*://teams.microsoft.com/*',
      SERVER_ORIGIN_PATTERN,
    ],
    action: {
      default_popup: 'popup.html',
      default_title: 'SIGNAL',
    },
  },
  vite: () => ({
    plugins: [tailwindcss()],
    define: {
      __WS_URL__: JSON.stringify(WS_URL),
      __SIGNAL_AUTH_TOKEN__: JSON.stringify(process.env.SIGNAL_AUTH_TOKEN ?? ''),
    },
    resolve: {
      alias: { '@signal/types': '../../packages/types/index.ts' },
    },
  }),
});
