import { test, expect } from '@playwright/test';

// Audio files served by dockerized backend, consumed by frontend speak button.
test('audio files work via docker backend + frontend speak', async ({ page, request }) => {
  // 1. backend serves a real mp3 for a known word (all guest defaults are en)
  const ok = await request.get('http://localhost:3000/api/audio/en/beautiful');
  expect(ok.status()).toBe(200);
  expect(ok.headers()['content-type']).toContain('audio/mpeg');
  expect((await ok.body()).length).toBeGreaterThan(1000);

  // 2. case-insensitive (frontend lowercases, backend too)
  const upper = await request.get('http://localhost:3000/api/audio/en/BEAUTIFUL');
  expect(upper.status()).toBe(200);

  // 3. missing word -> 404 so frontend falls back to browser voice
  const miss = await request.get('http://localhost:3000/api/audio/en/nosuchwordxyz');
  expect(miss.status()).toBe(404);

  // 4. frontend speak button actually requests backend audio and gets 200
  await page.goto('/');
  await expect(page.locator('button.speak')).toBeVisible();
  const [r2] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/audio/'), { timeout: 8000 }),
    page.locator('button.speak').click(),
  ]);
  expect([200, 206]).toContain(r2.status()); // 206 = range request from <audio>, also fine
  expect(r2.headers()['content-type']).toContain('audio/mpeg');
});
