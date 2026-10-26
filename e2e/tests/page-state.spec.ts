import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: {
      'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    } });
    const headers = { 'Access-Control-Allow-Origin': '*' };
    if (path === '/api/packs') return route.fulfill({ headers, json: [
      { id: 'en/starter', locale: 'en', name: 'starter', count: 10, minDifficulty: 1, maxDifficulty: 2 },
    ] });
    if (path === '/api/packs/en/starter') return route.fulfill({ headers, json:
      ['friend','because','beautiful','necessary','rhythm','occasion','definitely','separate','accommodate','embarrass'].map(word => ({ word, locale: 'en', difficulty: 1 })),
    });
    if (path === '/api/leaderboard') return route.fulfill({ headers, json: [] });
    return route.fulfill({ headers, status: 404, json: { error: 'not found' } });
  });
  await page.addInitScript(() => localStorage.setItem('st-words', JSON.stringify(['friend','because'])));
});

test('page changes share the shell, preferences and unfinished practice and word forms', async ({ page }) => {
  let packLoads = 0;
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/packs') packLoads++; });
  await page.goto('/');
  await page.getByLabel('Your spelling', { exact: true }).fill('unfinished answer');
  await page.getByRole('button', { name: 'My words', exact: true }).click();
  await page.getByPlaceholder('add word...').fill('moonstone');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Forest', exact: true }).click();
  await page.getByRole('button', { name: 'Español', exact: true }).click();
  await expect(page.locator('header nav')).toContainText('Mis palabras');
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await page.getByRole('button', { name: 'Practice', exact: true }).click();
  await expect(page.getByLabel('Your spelling', { exact: true })).toHaveValue('unfinished answer');
  await page.getByRole('button', { name: 'My words', exact: true }).click();
  await expect(page.getByPlaceholder('add word...')).toHaveValue('moonstone');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Forest', exact: true })).toHaveClass(/active/);
  await expect(page.locator('main')).toHaveCount(1);
  await expect(page.locator('header')).toHaveCount(1);
  expect(packLoads).toBe(1);
});

test('leaving a test page preserves its answer and progress while statistics keeps its period', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Test', exact: true }).click();
  await page.getByRole('button', { name: 'Start test', exact: true }).click();
  const answer = page.getByLabel('Your test spelling', { exact: true });
  await answer.fill('unfinished test');
  const progress = await page.locator('.test-progress strong').textContent();
  await page.getByRole('button', { name: 'Statistics', exact: true }).click();
  await page.getByRole('button', { name: 'Day', exact: true }).click();
  await page.getByRole('button', { name: 'Test', exact: true }).click();
  await expect(answer).toHaveValue('unfinished test');
  await expect(page.locator('.test-progress strong')).toHaveText(progress!);
  await page.getByRole('button', { name: 'Check', exact: true }).click();
  await expect(page.locator('.test-session .reveal')).toBeVisible();
  await page.getByRole('button', { name: 'Practice', exact: true }).click();
  await page.getByRole('button', { name: 'Test', exact: true }).click();
  await expect(page.locator('.test-session .reveal')).toBeVisible();
  await expect(page.locator('.test-progress strong')).toHaveText(progress!);
  await page.getByRole('button', { name: 'Statistics', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Day', exact: true })).toHaveAttribute('aria-pressed', 'true');
});
