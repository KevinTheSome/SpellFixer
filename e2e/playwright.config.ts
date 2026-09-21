import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  timeout: 15000,
  use: { baseURL: 'http://localhost:5173', trace: 'on-first-retry' },
  webServer: undefined, // docker compose already up
});
