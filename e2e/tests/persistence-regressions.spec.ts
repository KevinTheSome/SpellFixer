import {test,expect,type BrowserContext,type Page} from '@playwright/test';
import {readFileSync} from 'node:fs';
import type {Attempt,SavedTest} from '../../frontend/src/learning';

test.use({storageState:{cookies:[],origins:[]}});
const curriculum=JSON.parse(readFileSync(new URL('../../backend/content/en/practice.json',import.meta.url),'utf8'));
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type,Authorization','Access-Control-Allow-Methods':'GET,POST,DELETE,OPTIONS'};
const emptyStats={total:0,correct:0,accuracy:0,streak:0,best:0,dayStreak:0,bestDayStreak:0,activeDays:0,xp:0,level:0,xpPrev:0,xpNext:100};
function event():Attempt {
  const now=new Date();
  return {id:crypto.randomUUID(),session:crypto.randomUUID(),word:'friend',locale:'en',submitted:'friend',date:now.toISOString(),day:now.toISOString().slice(0,10),hour:now.getHours(),exercise:'practice',assistance:'none',correct:true,standard:'default'};
}
async function server(context:BrowserContext) {
  const state={token:'dummy-token',username:'alice',learningKey:crypto.randomUUID(),attempts:[] as Attempt[],tests:[] as SavedTest[]};
  await context.route('**/api/**',async route=>{
    const req=route.request(),path=new URL(req.url()).pathname,method=req.method();
    const reply=(json:unknown,status=200)=>route.fulfill({status,headers:cors,json});
    if(method==='OPTIONS') return reply({});
    if(path==='/api/curriculum') return reply(curriculum);
    if(path==='/api/packs') return reply([{id:'en/starter',locale:'en',name:'starter',count:2,minDifficulty:1,maxDifficulty:1}]);
    if(path==='/api/packs/en/starter') return reply(['friend','because'].map(word=>({word,locale:'en',difficulty:1})));
    if(path.startsWith('/api/audio/')) return reply({error:'no audio'},404);
    if(path==='/api/leaderboard') return reply([]);
    if(path==='/api/auth/login' || path==='/api/auth/register') return reply({token:state.token,username:state.username,learningKey:state.learningKey});
    if(req.headers().authorization!==`Bearer ${state.token}`) return reply({error:'unauthorized'},401);
    if(path==='/api/me') return reply({id:1,username:state.username,learningKey:state.learningKey});
    if(path==='/api/auth/logout') return reply({ok:true});
    if(path==='/api/words') return reply([]);
    if(path==='/api/activity') return reply({days:[],hourly:[]});
    if(path==='/api/account/data' || path==='/api/stats' && method==='DELETE') {
      state.learningKey=crypto.randomUUID();state.attempts=[];state.tests=[];
      if(path==='/api/account/data') state.token=crypto.randomUUID();
      return reply({token:state.token,username:state.username,learningKey:state.learningKey});
    }
    if(path==='/api/stats') return reply(emptyStats);
    if(path==='/api/learning') {
      if(method==='GET') return reply({learningKey:state.learningKey,attempts:state.attempts,tests:state.tests});
      const data=req.postDataJSON();
      if(data.learningKey!==state.learningKey) return reply({error:'history reset'},409);
      state.attempts=[...new Map([...state.attempts,...data.attempts].map((a:Attempt)=>[a.id,a])).values()];
      state.tests=[...new Map([...state.tests,...data.tests].map((r:SavedTest)=>[r.id,r])).values()];
      return reply({ok:true});
    }
    return reply({error:'not found'},404);
  });
  return state;
}
async function answer(page:Page,text:string) {
  await page.getByLabel('Your spelling',{exact:true}).fill(text);
  await page.getByRole('button',{name:'Check',exact:true}).click();
}
async function ready(page:Page) {
  await page.goto('/');
  await expect(page.locator('.save-status')).toContainText('Progress saved');
  await expect(page.locator('#exercise-prompt')).toBeVisible();
}

test('guest tabs retain concurrent answers, a completed test and consistent totals',async({page,context})=>{
  await server(context);
  await ready(page);
  const second=await context.newPage();await ready(second);
  await Promise.all([answer(page,'because'),answer(second,'wrong')]);
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('st-learning')!).guest.attempts.length)).toBe(2);
  await expect(page.locator('header .stats')).toContainText('1/2');
  await expect(second.locator('header .stats')).toContainText('1/2');
  await page.getByRole('button',{name:'Test',exact:true}).click();
  await page.getByRole('button',{name:'Start test',exact:true}).click();
  for(let i=0;i<2;i++) {
    await page.getByLabel('Your test spelling',{exact:true}).fill('wrong');
    await page.getByRole('button',{name:'Check',exact:true}).click();
    await page.getByRole('button',{name:i===1?'Finish':'Next →',exact:true}).click();
  }
  await expect(page.locator('.test-score')).toBeVisible();
  await second.getByRole('button',{name:'Try again',exact:true}).click();
  await answer(second,'because');
  await expect.poll(()=>second.evaluate(()=>JSON.parse(localStorage.getItem('st-learning')!).guest.tests.length)).toBe(1);
  await page.reload();
  await expect(page.locator('header .stats')).toContainText('1/2');
  await page.getByRole('button',{name:'Test',exact:true}).click();
  await expect(page.locator('.test-history-list .pack-row')).toHaveCount(1);
});

test('a guest reset invalidates stale tabs rather than restoring their answers',async({page,context})=>{
  await server(context);await ready(page);await answer(page,'because');
  await expect(page.locator('.save-status')).toContainText('Progress saved');
  const second=await context.newPage();
  await second.addInitScript(()=>window.addEventListener('storage',e=>e.stopImmediatePropagation(),true));
  await ready(second);
  await page.getByRole('button',{name:'clear stats',exact:true}).click();
  await expect(page.locator('header .stats')).toContainText('0/0');
  await answer(second,'wrong');
  await expect(second.getByRole('status').filter({hasText:'Progress was cleared'})).toBeVisible();
  expect(await second.evaluate(()=>JSON.parse(localStorage.getItem('st-learning')!).guest.attempts)).toEqual([]);
  await page.reload();await expect(page.locator('header .stats')).toContainText('0/0');
});

test('local-save failures stay visible and retry works while the account is offline',async({page,context})=>{
  const state=await server(context);
  await page.addInitScript(state=>localStorage.setItem('st-session',JSON.stringify(state)),{token:state.token,username:state.username,learningKey:state.learningKey});
  await ready(page);
  await page.route('**/api/me',route=>route.abort());
  await page.evaluate(()=>{
    const original=Storage.prototype.setItem;
    (window as any).failLedgerWrites=true;
    Storage.prototype.setItem=function(key,value) {
      if(key==='st-learning' && (window as any).failLedgerWrites) throw new DOMException('full','QuotaExceededError');
      return original.call(this,key,value);
    };
  });
  await answer(page,'wrong');
  await expect(page.locator('.save-status')).toContainText('Could not save on this device');
  const retry=page.getByRole('button',{name:'Retry sync',exact:true});
  await expect(retry).toBeEnabled();
  expect(state.attempts).toEqual([]);
  await page.evaluate(()=>{(window as any).failLedgerWrites=false});
  await retry.click();
  await expect(page.locator('.save-status')).toContainText('Saved on this device · sync pending');
  await page.reload();
  await expect.poll(()=>page.evaluate(()=> {
    const key=JSON.parse(localStorage.getItem('st-session')!).learningKey;
    return JSON.parse(localStorage.getItem('st-learning')!)[`account:${key}`].attempts.length;
  })).toBe(1);
});

test('applying a pack from fresh writing mode grades the word that was spoken',async({page,context})=>{
  await server(context);
  await page.addInitScript(()=>{Math.random=()=>0.75});
  await ready(page);
  const audio=page.waitForRequest(r=>r.url().includes('/api/audio/'));
  await page.getByRole('button',{name:'Use pack',exact:true}).click();
  const word=decodeURIComponent((await audio).url().split('/').at(-1)!);
  expect(word).toBe('because');
  await answer(page,word);
  await expect(page.locator('.ok')).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('st-learning')!).guest.attempts.at(-1))).toMatchObject({word,correct:true});
});

test('an account reset on another device isolates the offline queue and keeps writing available',async({page,context})=>{
  const state=await server(context);
  await page.addInitScript(state=>localStorage.setItem('st-session',JSON.stringify(state)),{token:state.token,username:state.username,learningKey:state.learningKey});
  await ready(page);
  await page.route('**/api/me',route=>route.abort());
  await answer(page,'wrong');
  await expect(page.locator('.save-status')).toContainText('sync pending');
  state.learningKey=crypto.randomUUID();state.attempts=[];
  await page.unroute('**/api/me');
  await page.getByRole('button',{name:'Retry sync',exact:true}).click();
  await expect(page.locator('.save-status')).toContainText('Progress saved');
  await expect(page.getByRole('status').filter({hasText:'Progress was cleared'})).toBeVisible();
  expect(state.attempts).toEqual([]);
  await expect(page.locator('#exercise-prompt')).toBeVisible();
  await answer(page,'because');
  await expect.poll(()=>state.attempts.length).toBe(1);
});

test('a stale tab cannot restore deleted data through the fresh session on reload',async({page,context})=>{
  const state=await server(context), old=event(),oldKey=state.learningKey;
  state.attempts=[old];
  await context.addInitScript(({token,username,learningKey,old})=>{
    if(localStorage.getItem('persistence-seeded')) return;
    localStorage.setItem('persistence-seeded','1');
    localStorage.setItem('st-session',JSON.stringify({token,username,learningKey}));
    localStorage.setItem('st-learning',JSON.stringify({[`account:${learningKey}`]:{attempts:[old],tests:[],pending:[old.id],pendingTests:[]}}));
  },{token:state.token,username:state.username,learningKey:oldKey,old});
  const stale=await context.newPage();
  await stale.addInitScript(()=>window.addEventListener('storage',e=>e.stopImmediatePropagation(),true));
  await stale.route('**/api/me',route=>route.abort());
  await stale.goto('/');await expect(stale.locator('.save-status')).toContainText('sync pending');
  await ready(page);
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.getByLabel('Current password',{exact:true}).fill('dummy-password');
  page.once('dialog',dialog=>dialog.accept());
  await page.getByRole('button',{name:'Delete data',exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'Account data deleted.'})).toBeVisible();
  expect(state.learningKey).not.toBe(oldKey);
  await answer(stale,'wrong');
  await expect.poll(()=>stale.evaluate(key=>JSON.parse(localStorage.getItem('st-learning')!)[`account:${key}`]?.pending.length,oldKey)).toBe(2);
  await page.reload();await expect(page.locator('.save-status')).toContainText('Progress saved');
  expect(state.attempts).toEqual([]);
});

test('a recreated username cannot inherit an older account cache or legacy summaries',async({page,context})=>{
  const state=await server(context),old=event(),oldKey=crypto.randomUUID();
  await page.addInitScript(({old,oldKey})=>{
    localStorage.setItem('st-learning',JSON.stringify(Object.fromEntries([`account:${oldKey}`,'account:alice'].map(key=>[key,{attempts:[old],tests:[],pending:[old.id],pendingTests:[]}]))));
    localStorage.setItem('st-test-results',JSON.stringify([{id:crypto.randomUUID(),owner:'alice',date:old.date,locale:'en',level:'starter',correct:1,total:1}]));
  },{old,oldKey});
  await ready(page);
  await page.getByRole('button',{name:'Account',exact:true}).click();
  await page.getByPlaceholder('username',{exact:true}).fill('alice');
  await page.getByPlaceholder('password',{exact:true}).fill('new-account-password');
  await page.getByRole('button',{name:'Login',exact:true}).click();
  await expect(page.locator('.save-status')).toContainText('Progress saved');
  await expect(page.getByRole('alert')).toContainText('Older account-only offline history');
  expect(state.attempts).toEqual([]);expect(state.tests).toEqual([]);
  expect(await page.evaluate(key=>JSON.parse(localStorage.getItem('st-learning')!)[`account:${key}`].attempts,oldKey)).toEqual([old]);
});
