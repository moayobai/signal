import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';

export default defineConfig({
  root: __dirname,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@signal/types': resolve(__dirname, '../../../../packages/types/index.ts'),
    },
  },
  server: { port: 3000 },
});
