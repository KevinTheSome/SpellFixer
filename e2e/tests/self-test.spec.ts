import { test, expect, type Page } from '@playwright/test';

const wordFrom = (url: string) => decodeURIComponent(url.split('/api/audio/')[1].split('/')[1]);

async function nextSpokenWord(page: Page, action: () => Promise<void>, used: string[] = []) {
  const [request] = await Promise.all([
    page.waitForRequest(r => r.url().includes('/api/audio/') && !used.includes(wordFrom(r.url()))),
    action(),
  ]);
  return wordFrom(request.url());
}

test('self test mixes difficulty, scores answers, and keeps history', async ({ page }) => {
  await Promise.all([
    page.waitForRequest(r => r.url().includes('/api/audio/')),
    page.goto('/'),
  ]);
  await page.getByRole('button', { name: 'Test', exact: true }).click();
  await page.getByRole('button', { name: 'Intermediate', exact: true }).click();

  const words: string[] = [];
  words.push(await nextSpokenWord(page, () => page.getByRole('button', { name: 'Start test' }).click(), words));

  for (let i = 0; i < 10; i++) {
    await page.locator('input.spell').fill(i % 2 === 0 ? words[i] : 'wrong-answer');
    await page.getByRole('button', { name: 'Check' }).click();
    if (i < 9) words.push(await nextSpokenWord(page, () => page.getByRole('button', { name: 'Next →' }).click(), words));
    else await page.getByRole('button', { name: 'Finish' }).click();
  }

  expect(new Set(words).size).toBe(10);
  const packs = await Promise.all(['starter', 'intermediate', 'expert'].map(async name => {
    const response = await page.request.get(`http://localhost:3000/api/packs/en/${name}`);
    return [name, new Set((await response.json()).map((entry: any) => entry.word))] as const;
  }));
  const intermediateWords = packs.find(([name]) => name === 'intermediate')![1];
  expect(words.filter(word => intermediateWords.has(word))).toHaveLength(8);
  expect(words.filter(word => !intermediateWords.has(word))).toHaveLength(2);

  await expect(page.locator('.test-score')).toContainText('50%');
  await expect(page.locator('.test-summary')).toContainText('50%');
  await expect(page.locator('.test-history')).toContainText('5/10');

  await page.reload();
  await page.getByRole('button', { name: 'Test', exact: true }).click();
  await expect(page.locator('.test-history')).toContainText('5/10');
});

test('self test supports every pack language', async ({ page }) => {
  await Promise.all([
    page.waitForRequest(r => r.url().includes('/api/audio/')),
    page.goto('/'),
  ]);
  const packs = await (await page.request.get('http://localhost:3000/api/packs')).json();
  const names = new Intl.DisplayNames(['en'], { type: 'language' });

  await page.getByRole('button', { name: 'Test', exact: true }).click();
  for (const locale of new Set<string>(packs.map((pack: any) => pack.locale))) {
    await expect(page.getByRole('button', { name: names.of(locale)!, exact: true })).toBeVisible();
  }

  await page.getByRole('button', { name: 'Spanish', exact: true }).click();
  const [request] = await Promise.all([
    page.waitForRequest(r => r.url().includes('/api/audio/es/')),
    page.getByRole('button', { name: 'Start test' }).click(),
  ]);
  expect(request.url()).toContain('/api/audio/es/');
});
