import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  retries: 1,
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  webServer: process.env.CI
    ? {
        command: 'pnpm dev',
        url: 'http://localhost:3000',
        timeout: 60000,
        reuseExistingServer: false,
        env: {
          FSP_MOCK_MODE: 'true',
          JWT_SECRET: process.env.JWT_SECRET || 'ci-test-secret-at-least-32-characters-long',
          DATABASE_URL:
            process.env.DATABASE_URL ||
            'postgresql://postgres:postgres@localhost:5432/fsp_scheduler_e2e',
          REDIS_HOST: process.env.REDIS_HOST || 'localhost',
          REDIS_PORT: process.env.REDIS_PORT || '6379',
          NEXT_PUBLIC_API_URL: 'http://localhost:3001/api/v1',
        },
      }
    : undefined, // In local dev, assumes `pnpm dev` is already running
});
