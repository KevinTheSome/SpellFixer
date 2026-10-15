import { test, expect, type Page } from '@playwright/test';

const WORDS = ['apple', 'bridge', 'cactus'];

async function seedAndGoto(page: Page, words: string[] = WORDS) {
  await page.addInitScript(
    ({ words }: { words: string[] }) => {
      localStorage.setItem('st-words', JSON.stringify(words));
      localStorage.setItem('st-drill', 'repeat');
      for (const k of ['st-stats', 'st-days', 'st-hours', 'st-wstats']) localStorage.removeItem(k);
    },
    { words },
  );
  await page.goto('/');
  await expect(page.locator('button.speak')).toBeVisible();
}

test('repetition mode shows word, requires correct answer, blocks paste', async ({ page }) => {
  await seedAndGoto(page);

  await page.getByRole('button', { name: 'Repeat' }).click();
  await expect(page.getByRole('button', { name: 'Repeat' })).toHaveClass(/active/);

  await expect(page.locator('.repeat-word')).toBeVisible();
  const word1 = await page.locator('.repeat-word').textContent();
  expect(WORDS).toContain(word1?.trim());

  await page.locator('input.spell').fill('wrong');
  await page.locator('button.cta').click();
  await expect(page.locator('.correction')).toBeVisible();
  await page.getByRole('button', {name:'Try again',exact:true}).click();
  await expect(page.locator('input.spell')).toHaveValue('');
  await expect(page.locator('.repeat-word')).toHaveCount(0);

  await page.locator('input.spell').fill(word1);
  await page.locator('button.cta').click();
  await expect(page.locator('.ok')).toBeVisible();
  await expect(page.locator('header .stats')).toContainText('0/0');
  await page.keyboard.press('Enter');
  await page.waitForFunction(
    (w) => document.querySelector('.repeat-word')?.textContent?.trim() !== w,
    word1,
    { timeout: 5000 },
  );
  const word2 = await page.locator('.repeat-word').textContent();
  expect(WORDS).toContain(word2?.trim());
  expect(word2?.trim()).not.toBe(word1);
});

test('repetition mode blocks paste (Ctrl+V / Cmd+V)', async ({ page, browserName }) => {
  await seedAndGoto(page);
  await page.getByRole('button', { name: 'Repeat' }).click();

  const word1 = await page.locator('.repeat-word').textContent();
  const modifier = browserName === 'darwin' ? 'Meta' : 'Control';

  await page.locator('input.spell').fill('');
  await page.locator('input.spell').focus();
  await page.keyboard.down(modifier);
  await page.keyboard.press('v');
  await page.keyboard.up(modifier);

  await expect(page.locator('input.spell')).toHaveValue('');
});

test('repetition mode allows typing and advancing correctly', async ({ page }) => {
  await seedAndGoto(page);
  await page.getByRole('button', { name: 'Repeat' }).click();

  for (let i = 0; i < WORDS.length; i++) {
    const word = await page.locator('.repeat-word').textContent();
    expect(WORDS).toContain(word?.trim());

    await page.locator('input.spell').fill(word);
    await page.locator('button.cta').click();
    await expect(page.locator('.ok')).toBeVisible();
    if (i < WORDS.length - 1) {
      await page.keyboard.press('Enter');
      await page.waitForFunction(
        (w) => document.querySelector('.repeat-word')?.textContent?.trim() !== w,
        word,
        { timeout: 5000 },
      );
    }
  }
});

test('repetition mode press Enter goes to next word after correct', async ({ page }) => {
  await seedAndGoto(page);
  await page.getByRole('button', { name: 'Repeat' }).click();

  const word1 = await page.locator('.repeat-word').textContent();
  expect(WORDS).toContain(word1?.trim());

  await page.locator('input.spell').fill(word1);
  await page.keyboard.press('Enter');
  await expect(page.locator('.ok')).toBeVisible();

  await page.keyboard.press('Enter');
  await page.waitForFunction(
    (w) => document.querySelector('.repeat-word')?.textContent?.trim() !== w,
    word1,
    { timeout: 5000 },
  );
  const word2 = await page.locator('.repeat-word').textContent();
  expect(WORDS).toContain(word2?.trim());
  expect(word2?.trim()).not.toBe(word1);
});
