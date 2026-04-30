import { defineConfig, devices } from '@playwright/test';
import { rmSync } from 'node:fs';
import { join } from 'node:path';

const port = Number(process.env.E2E_BROWSER_PORT ?? 18081);
const dbPath = join(process.cwd(), 'apps/server/signal.browser-e2e.db');

for (const suffix of ['', '-shm', '-wal']) {
  rmSync(`${dbPath}${suffix}`, { force: true });
}

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'corepack pnpm --filter server exec tsx src/index.ts',
    url: `http://127.0.0.1:${port}/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 20_000,
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_URL: dbPath,
      AI_PROVIDER: 'claude',
      ANTHROPIC_API_KEY: 'sk-ant-placeholder',
      DEEPGRAM_API_KEY: 'your-deepgram-key-here',
      HUME_API_KEY: 'your-hume-key-here',
      OCTAMEM_API_KEY: 'your-octamem-key-here',
      VOYAGE_API_KEY: 'your-voyage-key-here',
      SLACK_WEBHOOK_URL: 'your-slack-webhook-url-here',
      HUBSPOT_API_KEY: 'your-hubspot-key-here',
      SIGNAL_AUTH_TOKEN: 'signal-browser-e2e-token',
      SIGNAL_RATE_LIMIT_MAX: '500',
    },
  },
});
