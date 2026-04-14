import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  srcDir: '.',
  manifest: {
    name: 'SIGNAL',
    description: 'Real-time AI co-pilot for sales & investor calls',
    version: '0.1.0',
    permissions: ['tabs', 'storage'],
    host_permissions: [
      '*://meet.google.com/*',
      '*://*.zoom.us/*',
      '*://teams.microsoft.com/*',
    ],
  },
  vite: () => ({
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        '@signal/types': '../../packages/types/index.ts',
      },
    },
  }),
});
