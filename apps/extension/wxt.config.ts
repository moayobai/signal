import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  srcDir: '.',
  manifest: {
    name: 'SIGNAL',
    description: 'Real-time AI co-pilot for sales & investor calls',
    version: '0.1.0',
    permissions: ['tabs', 'storage', 'tabCapture'],
    host_permissions: [
      '*://meet.google.com/*',
      '*://*.zoom.us/*',
      '*://teams.microsoft.com/*',
      'http://localhost:8080/*',
    ],
    action: {
      default_popup: 'popup.html',
      default_title: 'SIGNAL',
    },
  },
  vite: () => ({
    plugins: [tailwindcss()],
    define: {
      __WS_URL__: JSON.stringify(process.env.WS_URL ?? 'ws://localhost:8080'),
      __SIGNAL_AUTH_TOKEN__: JSON.stringify(process.env.SIGNAL_AUTH_TOKEN ?? ''),
    },
    resolve: {
      alias: { '@signal/types': '../../packages/types/index.ts' },
    },
  }),
});
