import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
/** Test-only host code (the real one lives in Render's HOST_CODE setting). */
export const E2E_HOST_CODE = 'e2e-host-code';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 600_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  workers: 3,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    ...devices['Pixel 7'],
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npm run build && node --no-warnings dist/server/index.js`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: { PORT: String(PORT), DATABASE_PATH: './data/e2e-test.db', NODE_ENV: 'production', HOST_CODE: E2E_HOST_CODE },
  },
});
