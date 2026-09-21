import { test, expect, type Page } from '@playwright/test';

// Drill loop against the docker stack (backend :3000, frontend :5173).
// Seeds guest localStorage with known words, then discovers the current
// (hidden) word from the /api/audio/ request the Listen button fires.
const WORDS = ['apple', 'bridge', 'cactus', 'dolphin', 'engine'];

async function seedAndGoto(page: Page, words: string[] = WORDS, drill = 'seq') {
  await page.addInitScript(
    ({ words, drill }) => {
      localStorage.setItem('st-words', JSON.stringify(words));
      localStorage.setItem('st-drill', drill);
      for (const k of ['st-stats', 'st-days', 'st-hours', 'st-wstats']) localStorage.removeItem(k);
    },
    { words, drill },
  );
  await page.goto('/');
  await expect(page.locator('button.speak')).toBeVisible();
}

// Clicks action (Listen / Next) and returns the word its audio request asked for.
// accept filters requests: <audio> can re-request the same file (range
// follow-up), so when advancing we wait for the new word, not a stale repeat.
async function spokenWord(page: Page, action: () => Promise<void>, accept?: (w: string) => boolean): Promise<string> {
  const wordOf = (url: string) => decodeURIComponent(url.split('/api/audio/')[1].split('/')[1]);
  const [req] = await Promise.all([
    page.waitForRequest(
      (r) => r.url().includes('/api/audio/') && (accept ? accept(wordOf(r.url())) : true),
      { timeout: 10000 },
    ),
    action(),
  ]);
  return wordOf(req.url());
}

async function answer(page: Page, word: string) {
  await page.locator('input.spell').fill(word);
  await page.locator('button.cta').click();
}

test('practice word works: listen reveals a listed word, correct answer scores', async ({ page }) => {
  await seedAndGoto(page);
  const w = await spokenWord(page, () => page.locator('button.speak').click());
  expect(WORDS).toContain(w);

  await answer(page, w);
  await expect(page.locator('.ok')).toBeVisible();
  await expect(page.locator('header .stats')).toContainText('1/1');
});

test('sequential mode advances through the list in order', async ({ page }) => {
  await seedAndGoto(page, WORDS, 'seq');
  await page.getByRole('button', { name: 'In order' }).click();

  const w0 = await spokenWord(page, () => page.locator('button.speak').click());
  const i0 = WORDS.indexOf(w0);

  for (let step = 1; step <= 2; step++) {
    const cur = WORDS[(i0 + step - 1) % WORDS.length];
    const next = WORDS[(i0 + step) % WORDS.length];
    await answer(page, cur);
    await expect(page.locator('.ok')).toBeVisible();
    const got = await spokenWord(page, () => page.locator('button.cta').click(), (w) => w === next);
    expect(got).toBe(next);
  }
  await expect(page.locator('header .stats')).toContainText('2/2');
});

test('random mode advances to a different listed word', async ({ page }) => {
  await seedAndGoto(page, WORDS, 'rand');
  await page.getByRole('button', { name: 'Random' }).click();

  let cur = await spokenWord(page, () => page.locator('button.speak').click());
  for (let i = 0; i < 3; i++) {
    const prev = cur;
    await answer(page, cur);
    await expect(page.locator('.ok')).toBeVisible();
    cur = await spokenWord(page, () => page.locator('button.cta').click(),
      (w) => w !== prev && WORDS.includes(w));
    expect(WORDS).toContain(cur);
  }
});

test('statistics record correct and wrong attempts', async ({ page }) => {
  await seedAndGoto(page);
  const w0 = await spokenWord(page, () => page.locator('button.speak').click());

  await answer(page, w0);
  await expect(page.locator('.ok')).toBeVisible();
  const w1 = await spokenWord(page, () => page.locator('button.cta').click(),
    (w) => w !== w0 && WORDS.includes(w));

  await answer(page, 'zzz-wrong-answer');
  await expect(page.locator('.reveal strong')).toHaveText(w1);
  await expect(page.locator('header .stats')).toContainText('1/2');

  await page.getByRole('button', { name: 'Statistics' }).click();
  await expect(page.locator('main')).toContainText('50%');
  await expect(page.locator('main')).toContainText(w0);
});
