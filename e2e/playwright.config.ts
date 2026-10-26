import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  timeout: 15000,
  use: {
    baseURL: 'http://localhost:5173', trace: 'on-first-retry',
    // Existing drill tests explicitly exercise the legacy word-list mode. Writing tests use a fresh profile.
    storageState: { cookies: [], origins: [{ origin: 'http://localhost:5173', localStorage: [{ name: 'st-drill', value: 'rand' }] }] },
  },
  webServer: undefined, // docker compose already up
});
