import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  base: '/dashboard/',
  resolve: {
    alias: {
      '@signal/types': resolve(__dirname, '../../../packages/types/index.ts'),
    },
  },
  build: { outDir: '../public', emptyOutDir: true },
  server: { port: 5173, proxy: { '/api': 'http://localhost:8080' } },
});
