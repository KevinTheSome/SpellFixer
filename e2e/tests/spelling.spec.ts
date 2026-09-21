import { test, expect } from '@playwright/test';

test('health + guest drill + auth flow', async ({ page, request }) => {
  // backend health
  const h = await request.get('http://localhost:3000/health');
  expect(h.ok()).toBeTruthy();
  expect(await h.json()).toEqual({ ok: true });

  await page.goto('/');

  // guest mode visible
  await expect(page.locator('.brand')).toContainText('SpellingTeacher');
  await expect(page.locator('.authbar')).toContainText('Guest mode');
  await expect(page.locator('button.speak')).toBeVisible();
  await expect(page.locator('input.spell')).toBeVisible();

  // guest drill: type something and check -> feedback appears
  await page.locator('input.spell').fill('wrongword');
  await page.locator('button.cta').click();
  await expect(page.locator('.reveal, .ok')).toBeVisible();

  // register new user (random to avoid collisions)
  const user = `u_${Date.now()}_${Math.floor(Math.random()*1000)}`;
  await page.locator('.authbar input[placeholder="username"]').fill(user);
  await page.locator('.authbar input[placeholder="password"]').fill('test1234');
  await page.getByRole('button', { name: 'Register' }).click();
  await expect(page.locator('.authbar')).toContainText(`Synced as ${user}`, { timeout: 5000 });

  // backend words should be seeded (10 defaults) + check stats reset
  await page.getByRole('button', { name: /manage/ }).click();
  await expect(page.locator('.panel .chips').first().locator('.chip')).toHaveCount(10, { timeout: 5000 });

  // add a word via auth
  await page.locator('.panel input[placeholder="add word..."]').fill('playwright');
  await page.locator('.panel button', { hasText: 'Add' }).click();
  await expect(page.locator('.panel .chips').first().locator('.chip', { hasText: 'playwright' })).toBeVisible();

  await expect(page.locator('.panel .chips').first()).toContainText('playwright');

  // logout -> back to guest
  await page.getByRole('button', { name: 'Logout' }).click();
  await expect(page.locator('.authbar')).toContainText('Guest mode');
});
