import { test, expect } from '@playwright/test';
import type { Attempt } from '../../frontend/src/learning';

test('every tab shares the same shell, heading alignment and card styling at every screen size',async({page})=>{
  await page.goto('/');
  for(const width of [320,375,768,1440,1920]) {
    await page.setViewportSize({width,height:900});
    let baseline:unknown;
    for(const tab of ['Practice','My words','Test','Statistics','Settings']) {
      await page.locator('header nav').getByRole('button',{name:tab,exact:true}).click();
      await page.evaluate(()=>window.scrollTo(0,0));
      const layout=await page.evaluate(()=>{
        const main=document.querySelector('main')!,heading=main.querySelector('.page-heading')!,panel=main.querySelector('.panel')!;
        const style=getComputedStyle(panel),mainBox=main.getBoundingClientRect(),headingBox=heading.getBoundingClientRect();
        return {shell:document.querySelector('header')!.getBoundingClientRect().width,width:mainBox.width,padding:getComputedStyle(main).padding,headingX:headingBox.x,headingTop:headingBox.y-mainBox.y,radius:style.borderRadius,surface:style.backgroundColor,overflow:document.documentElement.scrollWidth>window.innerWidth};
      });
      expect(layout.width).toBe(width);
      expect(layout.shell).toBe(width);
      expect(layout.overflow,`${tab} overflows at ${width}px`).toBe(false);
      if(!baseline) baseline=layout;
      expect(layout,`${tab} differs from the shared layout at ${width}px`).toEqual(baseline);
    }
  }
});

test('two non-black dark themes persist and statistics fills desktop and mobile', async ({page})=>{
  await page.goto('/');
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  for (const [name,bg] of [['Navy','#1c293c'],['Forest','#20372e']]) {
    await page.getByRole('button',{name,exact:true}).click();
    await expect(page.getByRole('button',{name,exact:true})).toHaveClass(/active/);
    expect(await page.evaluate(()=>document.documentElement.style.colorScheme)).toBe('dark');
    expect(await page.evaluate(()=>document.documentElement.style.getPropertyValue('--on-accent'))).toBe('#1d1d1f');
    await page.reload();
    expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('st-theme')!).bg)).toBe(bg);
    await page.getByRole('button',{name:'Settings',exact:true}).click();
    await expect(page.getByRole('button',{name,exact:true})).toHaveClass(/active/);
  }
  await page.getByRole('button',{name:'Statistics',exact:true}).click();
  for (const width of [320,375,768,1440,1920]) {
    await page.setViewportSize({width,height:900});
    const box=await page.locator('main').boundingBox();
    expect(box!.width).toBe(width);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);
    await expect(page.getByRole('button',{name:'Day',exact:true})).toBeVisible();
  }
});

test('one period filters summaries, reviews, patterns, history, word details, chart and leaderboard',async({page})=>{
  await page.addInitScript(()=>{
    const day=(ago:number)=>{const d=new Date();d.setDate(d.getDate()-ago);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
    const answer=(word:string,submitted:string,ago:number,assistance='none',exercise='practice')=>({id:crypto.randomUUID(),session:crypto.randomUUID(),word,submitted,locale:'en',date:new Date(day(ago)+'T10:00:00').toISOString(),day:day(ago),hour:10,exercise,assistance,correct:word===submitted,standard:'default'});
    const attempts=[answer('outside','outside',30),answer('monthly','monthly',29),answer('market','marked',10),answer('basket','basked',9),answer('market','marked',8),answer('weekly','weekly',6),answer('friend','friend',0),answer('friend','friend',0,'retry'),answer('beautiful','beautiful',0,'none','test')];
    localStorage.setItem('st-learning',JSON.stringify({guest:{attempts,tests:[],pending:[],pendingTests:[]}}));
    const days:Record<string,{total:number,correct:number}>={};
    for (const a of attempts) {const d=days[a.day]??(days[a.day]={total:0,correct:0});d.total++;d.correct+=Number(a.correct)}
    localStorage.setItem('st-days',JSON.stringify(days));
    const hours=Array(24).fill(0);hours[10]=3;
    localStorage.setItem('st-hours',JSON.stringify({[day(0)]:hours}));
  });
  const ranges:number[]=[];
  await page.route('**/api/leaderboard?*',async route=>{
    const days=Number(new URL(route.request().url()).searchParams.get('days'));ranges.push(days);
    await route.fulfill({json:[{username:`range_${days}`,xp:days*10}]});
  });
  await page.goto('/');
  await page.getByRole('button',{name:'Statistics',exact:true}).click();
  const summary=page.locator('.period-summary .stat-card strong');
  await expect(summary).toHaveText(['50%','6','8','1','30']);
  await expect(page.locator('.statistics-learning')).toContainText('monthly');
  await expect(page.locator('.statistics-learning')).not.toContainText('outside');
  await expect(page.locator('.statistics-learning')).toContainText('t → d');
  await expect(page.locator('.board')).toContainText('range_30');
  await page.getByRole('button',{name:'Week',exact:true}).click();
  await expect(summary).toHaveText(['100%','2','4','1','20']);
  await expect(page.locator('.statistics-learning')).toContainText('weekly');
  await expect(page.locator('.statistics-learning')).not.toContainText('monthly');
  await expect(page.locator('.statistics-learning')).not.toContainText('t → d');
  await expect(page.locator('.board')).toContainText('range_7');
  await page.getByRole('button',{name:'Day',exact:true}).click();
  await expect(summary).toHaveText(['100%','1','3','1','10']);
  await expect(page.locator('.statistics-learning')).not.toContainText('weekly');
  await expect(page.locator('.board')).toContainText('range_1');
  await page.locator('.statistics-words > summary').click();
  await page.locator('.statistics-words details > summary').filter({hasText:'Starter'}).click();
  await expect(page.locator('tr').filter({has:page.locator('strong',{hasText:/^friend$/})})).toContainText('100%');
  await expect(page.locator('.statistics-words')).not.toContainText('weekly');
  expect(ranges).toEqual(expect.arrayContaining([30,7,1]));
});

test('personal words stay local for guests, sync for accounts, remain private and can be practised',async({page,browser,request})=>{
  await page.goto('/');
  await page.getByRole('button',{name:'My words',exact:true}).click();
  const manager=page.getByRole('region',{name:'My words'});
  await manager.getByPlaceholder('add word...').fill('moonstone');
  await manager.getByRole('button',{name:'Add',exact:true}).click();
  await expect(manager.getByRole('alert')).toContainText('Confirm this spelling');
  await manager.getByRole('checkbox').check();
  await manager.getByRole('button',{name:'Add',exact:true}).click();
  await expect(manager).toContainText('Word saved.');
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('st-extra-words')!))).toEqual([{word:'moonstone',locale:'en'}]);
  await page.reload();
  await page.getByRole('button',{name:'My words',exact:true}).click();
  await expect(manager.locator('.chips')).toContainText('moonstone');
  await manager.getByPlaceholder('add word...').fill(' MOONSTONE ');
  await manager.getByRole('button',{name:'Add',exact:true}).click();
  await expect(manager.getByRole('alert')).toHaveText('This word is already saved.');
  await manager.getByPlaceholder('add word...').fill('<script>');
  await manager.getByRole('button',{name:'Add',exact:true}).click();
  await expect(manager.getByRole('alert')).toContainText('Use letters');

  const username=`words_${crypto.randomUUID().slice(0,8)}`,password='test12345';
  await page.getByRole('button',{name:'Account',exact:true}).click();
  await page.getByPlaceholder('username',{exact:true}).fill(username);
  await page.getByPlaceholder('password',{exact:true}).fill(password);
  await page.getByRole('button',{name:'Register',exact:true}).click();
  await expect(page.locator('.authbar')).toContainText(`Synced as ${username}`);
  await manager.getByPlaceholder('add word...').fill('Sternenlicht');
  await manager.getByLabel('Word language').selectOption('de');
  await manager.getByRole('checkbox').check();
  await manager.getByRole('button',{name:'Add',exact:true}).click();
  await expect(manager.locator('.chips')).toContainText('sternenlicht · de');
  const token=await page.evaluate(()=>localStorage.getItem('st-token'));
  const headers={Authorization:`Bearer ${token}`};
  const words=await (await request.get('http://localhost:3000/api/words',{headers})).json();
  const custom=words.find((w:any)=>w.word==='sternenlicht');
  expect(custom.locale).toBe('de');
  expect((await request.get('http://localhost:3000/api/words')).status()).toBe(401);
  expect((await request.post('http://localhost:3000/api/words',{headers,data:{word:'<script>',locale:'en',confirmed:true}})).status()).toBe(400);
  const outsider=await (await request.post('http://localhost:3000/api/auth/register',{data:{username:`other_${crypto.randomUUID().slice(0,8)}`,password}})).json();
  expect((await request.delete(`http://localhost:3000/api/words/${custom.id}`,{headers:{Authorization:`Bearer ${outsider.token}`}})).status()).toBe(404);

  const context=await browser.newContext();
  const second=await context.newPage();
  await second.goto('/');
  await second.getByRole('button',{name:'Account',exact:true}).click();
  await second.getByPlaceholder('username',{exact:true}).fill(username);
  await second.getByPlaceholder('password',{exact:true}).fill(password);
  await second.getByRole('button',{name:'Login',exact:true}).click();
  await expect(second.locator('.authbar')).toContainText(`Synced as ${username}`);
  await second.getByRole('button',{name:'My words',exact:true}).click();
  await expect(second.locator('.word-manager .chips')).toContainText('sternenlicht');
  const audio=second.waitForRequest(r=>r.url().includes('/api/audio/de/sternenlicht'));
  await second.getByRole('button',{name:'Practice these words',exact:true}).click();
  await second.getByRole('button',{name:'Speak word',exact:true}).click();
  await audio;
  await second.getByRole('button',{name:'My words',exact:true}).click();
  await second.getByRole('button',{name:'remove sternenlicht (de)',exact:true}).click();
  await expect(second.locator('.word-manager .chips')).not.toContainText('sternenlicht');
  await context.close();
  await page.getByRole('button',{name:'Account',exact:true}).click();
  await page.getByRole('button',{name:'Logout → guest',exact:true}).click();
  await expect(manager.locator('.chips')).toContainText('moonstone');
  await expect(manager.locator('.chips')).not.toContainText('sternenlicht');
});

test('leaderboard period includes boundary days, excludes assisted/test answers and deduplicates XP',async({request})=>{
  const username=`period_${crypto.randomUUID().slice(0,8)}`;
  const auth=await (await request.post('http://localhost:3000/api/auth/register',{data:{username,password:'test12345'}})).json();
  const headers={Authorization:`Bearer ${auth.token}`};
  const day=(ago:number)=>{const d=new Date();d.setDate(d.getDate()-ago);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
  const make=(ago:number,word:string,assistance:Attempt['assistance']='none',exercise:Attempt['exercise']='practice'):Attempt=>({id:crypto.randomUUID(),session:crypto.randomUUID(),word,submitted:word,locale:'en',date:new Date(day(ago)+'T00:00:00').toISOString(),day:day(ago),hour:0,exercise,assistance,correct:true,standard:'default'});
  const attempts=[make(30,'outside'),make(29,'monthly'),make(7,'lastweek'),make(6,'weekly'),make(0,'friend'),make(0,'friend'),make(0,'assisted','copy'),make(0,'tested','none','test')];
  const response=await request.post('http://localhost:3000/api/learning',{headers,data:{attempts,tests:[]}});
  expect(response.ok(),await response.text()).toBeTruthy();
  for (const [days,xp] of [[1,10],[7,20],[30,40]]) {
    const rows=await (await request.get(`http://localhost:3000/api/leaderboard?limit=50&days=${days}&today=${day(0)}`)).json();
    expect(rows.find((r:any)=>r.username===username)).toEqual({username,xp});
  }
  expect((await request.get('http://localhost:3000/api/leaderboard?days=999')).status()).toBe(400);
  expect((await request.get('http://localhost:3000/api/leaderboard?days=7&today=2026-02-31')).status()).toBe(400);
});
