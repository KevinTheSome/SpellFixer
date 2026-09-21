import { test, expect } from '@playwright/test';

// New features: drill modes, hints (unscored), stats grouped by language/difficulty.
test('drill modes + hint skips scoring + grouped stats', async ({ page }) => {
  await page.goto('/');

  // drill mode picker visible; weakest locked before half the pack is done
  await expect(page.getByRole('button', { name: 'In order' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Random' })).toBeVisible();
  const weak = page.getByRole('button', { name: 'Weakest first' });
  await expect(weak).toBeDisabled();
  await expect(page.locator('main')).toContainText('Spell over half the pack');

  // sequential mode sticks
  await page.getByRole('button', { name: 'In order' }).click();
  await expect(page.getByRole('button', { name: 'In order' })).toHaveClass(/active/);

  // hint: all guest defaults are en pack words, so a hint exists
  await page.getByRole('button', { name: 'Show hint' }).click();
  await expect(page.locator('main')).toContainText('Hint used — this word is not scored');

  // wrong answer WITH hint -> nothing recorded (no fail, no total)
  await page.locator('input.spell').fill('xyz-wrong-answer');
  await page.locator('button.cta').click();
  await expect(page.locator('.reveal, .ok')).toBeVisible();
  await expect(page.locator('header .stats')).toContainText('0/0');

  // stats: grouped language → difficulty tree with per-section avg
  await page.getByRole('button', { name: 'Statistics' }).click();
  await expect(page.locator('main')).toContainText('English');
  await expect(page.locator('main')).toContainText('avg');
  await expect(page.locator('main')).toContainText('Starter ★1–2');

  // pack API serves hints
  const pack = await page.request.get('http://localhost:3000/api/packs/en/intermediate');
  expect(pack.ok()).toBeTruthy();
  const entries = await pack.json();
  const aggr = entries.find((e: any) => e.word === 'aggressive');
  expect(aggr?.hint).toContain("2 g's");
});
