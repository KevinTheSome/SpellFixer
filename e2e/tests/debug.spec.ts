import { test, expect, type Page } from '@playwright/test';

test('debug vite serving', async ({ page }) => {
  page.on('response', async (resp) => {
    const url = resp.url();
    console.log(`RESP: ${resp.status()} ${url.substring(0, 100)}`);
  });

  await page.goto('http://localhost:5173/');
  await page.waitForTimeout(3000);
  console.log('--- done ---');
});