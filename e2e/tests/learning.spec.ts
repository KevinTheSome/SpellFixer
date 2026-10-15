import { test, expect, type Page } from '@playwright/test';

async function answer(page:Page, text:string) {
  await page.locator('input.spell').fill(text);
  await page.getByRole('button',{name:'Check',exact:true}).click();
}

test('guest retries stay hidden, assistance is retained, reviews survive reload and daily lesson stops', async ({page})=>{
  await page.addInitScript(()=>{if(!localStorage.getItem('seeded')){localStorage.setItem('seeded','1');localStorage.setItem('st-words',JSON.stringify(['friend','necessary','because','beautiful']));localStorage.setItem('st-drill','seq')}});
  await page.goto('/');
  await answer(page,'freind');
  await expect(page.locator('.changed-spans')).toContainText('ie → ei');
  await page.getByRole('button',{name:'Try again',exact:true}).click();
  await expect(page.locator('.correction')).toHaveCount(0);
  await expect(page.locator('input.spell')).toHaveValue('');
  await expect(page.locator('input.spell')).toHaveAttribute('placeholder','type spelling...');
  await answer(page,'friend');
  await expect(page.locator('header .stats')).toContainText('0/1');
  const local=await page.evaluate(()=>JSON.parse(localStorage.getItem('st-learning')!).guest);
  expect(local.attempts.map((a:any)=>a.assistance)).toEqual(['none','retry']);
  await page.reload();
  await page.getByRole('button',{name:'Statistics',exact:true}).click();
  await expect(page.locator('.learning-panel')).toContainText('friend');
  await expect(page.locator('.learning-panel')).toContainText('1 Assisted study');
  await page.getByRole('button',{name:'Practice',exact:true}).click();
  await page.getByRole('button',{name:'Start daily lesson',exact:true}).click();
  let count=0;
  while(!await page.locator('.lesson-summary').count()) {
    await answer(page,'wrong');
    await page.getByRole('button',{name:'Continue → review later',exact:true}).click();
    expect(++count).toBeLessThanOrEqual(10);
  }
  await expect(page.locator('.lesson-summary')).toContainText('Next review');
  await expect(page.locator('input.spell')).toHaveCount(0);
});

test('packs do not replace saved words and language follows audio for guests and accounts',async({page})=>{
  await page.goto('/');
  const german=page.locator('.pack-row').filter({hasText:'German'}).filter({hasText:'starter'});
  const [audio]=await Promise.all([page.waitForRequest(r=>r.url().includes('/api/audio/de/')),german.getByRole('button',{name:'Use pack',exact:true}).click()]);
  expect(audio.url()).toContain('/api/audio/de/');
  await page.getByRole('button',{name:/manage word list/}).click();
  await expect(page.locator('.chips').first().locator('.chip')).toHaveCount(10);
  const user=`learning_${crypto.randomUUID().slice(0,8)}`;
  await page.getByPlaceholder('username',{exact:true}).fill(user);await page.getByPlaceholder('password',{exact:true}).fill('test12345');
  await page.getByRole('button',{name:'Register',exact:true}).click();
  await expect(page.locator('.authbar')).toContainText(user);
  await expect(page.locator('.chips').first().locator('.chip')).toHaveCount(10);
  const spanish=page.locator('.pack-row').filter({hasText:'Spanish'}).filter({hasText:'starter'});
  const [spanishAudio]=await Promise.all([page.waitForRequest(r=>r.url().includes('/api/audio/es/')),spanish.getByRole('button',{name:'Use pack',exact:true}).click()]);
  const target=decodeURIComponent(spanishAudio.url().split('/api/audio/es/')[1]);
  await answer(page,target);
  await expect(page.locator('header .stats')).toContainText('1/1');
  await expect(page.locator('.save-status')).toContainText('Progress saved');
  await expect(page.locator('.chips').first().locator('.chip')).toHaveCount(10);
  await page.reload();
  await Promise.all([page.waitForRequest(r=>r.url().includes('/api/audio/es/')),page.getByRole('button',{name:'Speak word',exact:true}).click()]);
});

test('guest import, failed-save retry, idempotent sync and cross-device test history',async({page,browser,request})=>{
  await page.goto('/');await answer(page,'becaus');
  const user=`sync_${crypto.randomUUID().slice(0,8)}`;
  await page.getByPlaceholder('username',{exact:true}).fill(user);await page.getByPlaceholder('password',{exact:true}).fill('test12345');
  await page.getByRole('button',{name:'Register',exact:true}).click();
  await expect(page.locator('.authbar')).toContainText(`Synced as ${user}`);
  await expect(page.locator('.save-status')).toContainText('Progress saved');
  await expect(page.locator('header .stats')).toContainText('0/1');
  const token=await page.evaluate(()=>localStorage.getItem('st-token')!);
  const headers={Authorization:`Bearer ${token}`};
  const history=await (await request.get('http://localhost:3000/api/learning',{headers})).json();
  expect(history.attempts).toHaveLength(1);
  for(let i=0;i<2;i++) {const response=await request.post('http://localhost:3000/api/learning',{headers,data:{attempts:history.attempts,tests:[]}});expect(response.ok(),await response.text()).toBeTruthy()}
  expect((await (await request.get('http://localhost:3000/api/learning',{headers})).json()).attempts).toHaveLength(1);
  await page.route('**/api/learning',route=>route.request().method()==='POST'?route.abort():route.continue());
  await answer(page,'because');
  await expect(page.locator('.save-status')).toContainText('sync pending');
  await page.reload();await expect(page.locator('.save-status')).toContainText('sync pending');
  await page.unroute('**/api/learning');await page.getByRole('button',{name:'Retry sync',exact:true}).click();
  await expect(page.locator('.save-status')).toContainText('Progress saved');
  const a={...history.attempts[0],id:crypto.randomUUID(),session:crypto.randomUUID(),exercise:'test',submitted:'because',correct:true};
  const result={id:crypto.randomUUID(),date:a.date,level:'starter',locale:'en',correct:1,total:1,answers:[a]};
  expect((await request.post('http://localhost:3000/api/learning',{headers,data:{attempts:[a],tests:[result]}})).ok()).toBeTruthy();
  const other=await browser.newContext();const second=await other.newPage();
  await second.goto('/');await second.getByPlaceholder('username',{exact:true}).fill(user);await second.getByPlaceholder('password',{exact:true}).fill('test12345');await second.getByRole('button',{name:'Login',exact:true}).click();
  await second.getByRole('button',{name:'Test',exact:true}).click();await expect(second.locator('.test-history')).toContainText('1/1');
  await other.close();
  expect((await request.get('http://localhost:3000/api/learning')).status()).toBe(401);
  const invalid={...a,id:crypto.randomUUID(),locale:'../en'};
  expect((await request.post('http://localhost:3000/api/learning',{headers,data:{attempts:[invalid],tests:[]}})).status()).toBe(400);
  const outsider=await (await request.post('http://localhost:3000/api/auth/register',{data:{username:`other_${crypto.randomUUID().slice(0,8)}`,password:'test12345'}})).json();
  const outsiderHistory=await (await request.get('http://localhost:3000/api/learning',{headers:{Authorization:`Bearer ${outsider.token}`}})).json();
  expect(outsiderHistory).toEqual({attempts:[],tests:[]});
});
