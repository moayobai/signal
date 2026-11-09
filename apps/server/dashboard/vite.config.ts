import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  base: '/dashboard/',
  define: {
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
  resolve: {
    alias: {
      '@signal/types': resolve(__dirname, '../../../packages/types/index.ts'),
    },
  },
  build: { outDir: '../public', emptyOutDir: true },
  server: { port: 5173, proxy: { '/api': 'http://localhost:8080' } },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
