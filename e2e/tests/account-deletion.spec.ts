import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import type { Attempt, SavedTest } from '../../frontend/src/learning';

const base = 'http://localhost:3000';
const password = 'test12345';
type Account = { username: string; token: string };
const headers = (account: Account) => ({ Authorization: `Bearer ${account.token}` });

async function account(request: APIRequestContext): Promise<Account> {
  const response = await request.post(`${base}/api/auth/register`, {
    data: { username: `delete_${crypto.randomUUID().slice(0, 8)}`, password },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

function answer(word = 'friend', exercise: Attempt['exercise'] = 'practice'): Attempt {
  const date = new Date();
  const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return {
    id: crypto.randomUUID(), session: crypto.randomUUID(), word, submitted: word, locale: 'en',
    date: date.toISOString(), day, hour: date.getHours(), exercise, assistance: 'none', correct: true, standard: 'default',
  };
}

async function seed(request: APIRequestContext, user: Account) {
  expect((await request.post(`${base}/api/words`, { headers: headers(user), data: { word: 'friend' } })).ok()).toBeTruthy();
  const attempts = [answer(), answer('because', 'test')];
  const result: SavedTest = {
    id: crypto.randomUUID(), owner: user.username, date: attempts[1].date, locale: 'en', level: 'starter',
    correct: 1, total: 1, answers: [attempts[1]],
  };
  const response = await request.post(`${base}/api/learning`, { headers: headers(user), data: { attempts, tests: [result] } });
  expect(response.ok(), await response.text()).toBeTruthy();
}

async function expectEmpty(request: APIRequestContext, user: Account) {
  expect(await (await request.get(`${base}/api/words`, { headers: headers(user) })).json()).toEqual([]);
  expect(await (await request.get(`${base}/api/learning`, { headers: headers(user) })).json()).toEqual({ attempts: [], tests: [] });
  expect(await (await request.get(`${base}/api/stats`, { headers: headers(user) })).json()).toMatchObject({ total: 0, correct: 0, xp: 0, activeDays: 0 });
  const activity = await (await request.get(`${base}/api/activity`, { headers: headers(user) })).json();
  expect(activity.days.every((day: {total:number}) => day.total === 0)).toBe(true);
}

async function settings(page: Page, user: Account) {
  await page.addInitScript(user => {
    if (localStorage.getItem('deletion-seeded')) return;
    localStorage.setItem('deletion-seeded', '1');
    localStorage.setItem('st-session', JSON.stringify(user));
    localStorage.setItem('st-token', user.token);
    localStorage.setItem('st-user', user.username);
    localStorage.setItem('st-words', JSON.stringify(['guestword']));
    localStorage.setItem('st-stats', JSON.stringify({ total: 1, correct: 1 }));
    localStorage.setItem('st-xp', '10');
    localStorage.setItem('st-learning', JSON.stringify({ guest: { attempts: [], tests: [], pending: [], pendingTests: [] } }));
    localStorage.setItem('st-test-results', JSON.stringify(['guest', user.username].map(owner => ({
      id: crypto.randomUUID(), owner, date: new Date().toISOString(), locale: 'en', level: 'starter', correct: 1, total: 1,
    }))));
  }, user);
  await page.goto('/');
  await expect(page.locator('.save-status')).toContainText('Progress saved');
  await expect(page.locator('.account-trigger')).toContainText(user.username);
  await expect.poll(() => page.evaluate(username => JSON.parse(localStorage.getItem('st-learning')!)[`account:${username}`]?.attempts.length, user.username)).toBe(2);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
}

test('account deletion endpoints require authentication and the current password', async ({ request }) => {
  const user = await account(request);
  await seed(request, user);
  for (const path of ['/api/account', '/api/account/data']) {
    expect((await request.delete(base + path, { data: { password } })).status()).toBe(401);
    for (const data of [{}, { password: [] }, { password: ' ' }]) {
      expect((await request.delete(base + path, { headers: headers(user), data })).status()).toBe(400);
    }
    expect((await request.delete(base + path, { headers: headers(user), data: { password: 'wrong' } })).status()).toBe(403);
  }
  expect(await (await request.get(`${base}/api/stats`, { headers: headers(user) })).json()).toMatchObject({ total: 1, xp: 10 });
  expect((await (await request.get(`${base}/api/words`, { headers: headers(user) })).json()).length).toBe(1);
});

test('deleting data keeps the account, rotates sessions, deletes all learning data and isolates other users', async ({ request }) => {
  const user = await account(request), other = await account(request);
  await seed(request, user);
  await seed(request, other);
  const second = await (await request.post(`${base}/api/auth/login`, { data: { username: user.username, password } })).json();
  const response = await request.delete(`${base}/api/account/data`, {
    headers: headers(user), data: { password: `  ${password}  `, userId: 999, username: other.username },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const fresh: Account = await response.json();
  expect(fresh.username).toBe(user.username);
  expect(fresh.token).not.toBe(user.token);
  for (const old of [user, second]) expect((await request.get(`${base}/api/me`, { headers: headers(old) })).status()).toBe(401);
  await expectEmpty(request, fresh);
  expect((await request.post(`${base}/api/auth/login`, { data: { username: user.username, password } })).ok()).toBeTruthy();
  expect(await (await request.get(`${base}/api/stats`, { headers: headers(other) })).json()).toMatchObject({ total: 1, xp: 10 });
});

test('deleting an account removes its data and all sessions without affecting another account', async ({ request }) => {
  const user = await account(request), other = await account(request);
  await seed(request, user);
  await seed(request, other);
  const second: Account = await (await request.post(`${base}/api/auth/login`, { data: { username: user.username, password } })).json();
  const response = await request.delete(`${base}/api/account`, { headers: headers(user), data: { password, username: other.username } });
  expect(response.ok(), await response.text()).toBeTruthy();
  for (const old of [user, second]) {
    for (const path of ['/api/me', '/api/words', '/api/learning']) expect((await request.get(base + path, { headers: headers(old) })).status()).toBe(401);
  }
  expect((await request.post(`${base}/api/auth/login`, { data: { username: user.username, password } })).status()).toBe(401);
  const recreated = await request.post(`${base}/api/auth/register`, { data: { username: user.username, password } });
  expect(recreated.ok(), await recreated.text()).toBeTruthy();
  await expectEmpty(request, await recreated.json());
  expect(await (await request.get(`${base}/api/stats`, { headers: headers(other) })).json()).toMatchObject({ total: 1, xp: 10 });
});

test('concurrent sync and word writes cannot restore data after deletion revokes their sessions', async ({ request }) => {
  for (let i = 0; i < 3; i++) {
    const user = await account(request);
    await seed(request, user);
    const [deleted, synced, saved] = await Promise.all([
      request.delete(`${base}/api/account/data`, { headers: headers(user), data: { password } }),
      request.post(`${base}/api/learning`, { headers: headers(user), data: { attempts: [answer()], tests: [] } }),
      request.post(`${base}/api/words`, { headers: headers(user), data: { word: 'beautiful' } }),
    ]);
    expect(deleted.ok(), await deleted.text()).toBeTruthy();
    expect([200, 401]).toContain(synced.status());
    expect([201, 401]).toContain(saved.status());
    const fresh: Account = await deleted.json();
    await expectEmpty(request, fresh);
    expect((await request.post(`${base}/api/learning`, { headers: headers(user), data: { attempts: [answer()], tests: [] } })).status()).toBe(401);
  }
});

test('guests do not see destructive account controls', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Delete data', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Delete account', exact: true })).toHaveCount(0);
});

test('cancelled or failed deletion leaves local progress, words and credentials intact', async ({ page, request }) => {
  const user = await account(request);
  await seed(request, user);
  await settings(page, user);
  const remove = page.getByRole('button', { name: 'Delete data', exact: true });
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  }
  await expect(remove).toBeDisabled();
  await page.getByLabel('Current password', { exact: true }).fill(password);
  const before = await page.evaluate(() => ({ session: localStorage.getItem('st-session'), history: localStorage.getItem('st-learning') }));
  let deletions = 0;
  page.on('request', request => { if (request.method() === 'DELETE') deletions++; });
  page.once('dialog', dialog => dialog.dismiss());
  await remove.click();
  expect(deletions).toBe(0);
  await page.route('**/api/account/data', route => route.fulfill({ status: 500, json: { error: 'Deletion failed' }, headers: { 'Access-Control-Allow-Origin': '*' } }));
  page.once('dialog', dialog => dialog.accept());
  await remove.click();
  await expect(page.getByRole('alert')).toHaveText('Deletion failed');
  expect(await page.evaluate(() => ({ session: localStorage.getItem('st-session'), history: localStorage.getItem('st-learning') }))).toEqual(before);
  await expect(remove).toBeEnabled();
  await page.getByRole('button', { name: 'My words', exact: true }).click();
  await expect(page.locator('.chips')).toContainText('friend');
});

for (const removeAccount of [false, true]) test(`settings ${removeAccount ? 'account' : 'data'} deletion clears the device cache and preserves guest data`, async ({ page, request }) => {
  const user = await account(request);
  await seed(request, user);
  await settings(page, user);
  await page.getByLabel('Current password', { exact: true }).fill(password);
  page.once('dialog', async dialog => {
    expect(dialog.message()).toContain(user.username);
    expect(dialog.message()).toContain('cannot be undone');
    await dialog.accept();
  });
  await page.getByRole('button', { name: removeAccount ? 'Delete account' : 'Delete data', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: removeAccount ? 'Account deleted.' : 'Account data deleted.' })).toBeVisible();
  const cache = await page.evaluate(user => ({
    learning: JSON.parse(localStorage.getItem('st-learning')!)[`account:${user.username}`],
    guestWords: JSON.parse(localStorage.getItem('st-words')!), guestXp: localStorage.getItem('st-xp'),
    testOwners: JSON.parse(localStorage.getItem('st-test-results')!).map((result: SavedTest) => result.owner),
    session: JSON.parse(localStorage.getItem('st-session')!),
  }), user);
  expect(cache.learning).toBeUndefined();
  expect(cache.guestWords).toEqual(['guestword']);
  expect(cache.guestXp).toBe('10');
  expect(cache.testOwners).toEqual(['guest']);
  if (!removeAccount) {
    expect(cache.session.username).toBe(user.username);
    expect(cache.session.token).not.toBe(user.token);
    await expectEmpty(request, cache.session);
    await page.reload();
    await page.getByRole('button', { name: 'My words', exact: true }).click();
    await expect(page.locator('.chips')).not.toContainText('friend');
    await page.getByRole('button', { name: 'Account', exact: true }).click();
    await page.getByRole('button', { name: 'Logout → guest', exact: true }).click();
  } else {
    expect(cache.session.token).toBe('');
    await expect(page.getByRole('button', { name: 'Delete account', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'My words', exact: true }).click();
  }
  await expect(page.locator('.chips')).toContainText('guestword');
});

test('deletion waits for an active learning upload before clearing its result', async ({ page, request }) => {
  const user = await account(request);
  await seed(request, user);
  await settings(page, user);
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let uploading = false, deleting = false;
  await page.route('**/api/learning', async route => {
    if (route.request().method() === 'POST') { uploading = true; await held; }
    await route.fallback();
  });
  page.on('request', request => { if (request.method() === 'DELETE') deleting = true; });
  await page.getByRole('button', { name: 'Practice', exact: true }).click();
  await page.getByLabel('Your spelling', { exact: true }).fill('wrong');
  await page.getByRole('button', { name: 'Check', exact: true }).click();
  await expect.poll(() => uploading).toBe(true);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Current password', { exact: true }).fill(password);
  page.once('dialog', dialog => dialog.accept());
  const remove = page.getByRole('button', { name: 'Delete data', exact: true });
  await remove.click();
  await expect(remove).toBeDisabled();
  expect(deleting).toBe(false);
  release();
  await expect(page.getByRole('status').filter({ hasText: 'Account data deleted.' })).toBeVisible();
  const session = await page.evaluate(() => JSON.parse(localStorage.getItem('st-session')!));
  await expectEmpty(request, session);
});
