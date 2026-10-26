import {test,expect,type Page,type Route} from '@playwright/test';
import type {Attempt,LearningStore,SavedTest} from '../../frontend/src/learning';
import type {Stats} from '../../frontend/src/api';

const words=['friend','because','beautiful','necessary','rhythm','occasion','definitely','separate','accommodate','embarrass'];
const packs=['en','de','es'].flatMap(locale=>['starter','intermediate'].map(name=>({id:`${locale}/${name}`,locale,name,count:10,minDifficulty:1,maxDifficulty:3})));
const emptyStats:Stats={total:0,correct:0,accuracy:0,streak:0,best:0,dayStreak:0,bestDayStreak:0,activeDays:0,xp:0,level:0,xpPrev:0,xpNext:100};
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type,Authorization','Access-Control-Allow-Methods':'GET,POST,DELETE,OPTIONS'};
type Account={attempts:Attempt[];tests:SavedTest[]};
function attempt(word='friend',correct=true):Attempt {
  const date=new Date();
  const day=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  return {id:crypto.randomUUID(),session:crypto.randomUUID(),word,locale:'en',submitted:correct?word:'wrong',date:date.toISOString(),day,hour:date.getHours(),exercise:'practice',assistance:'none',correct,standard:'default'};
}
function stubApi(accounts:Record<string,Account>={}) {
  return async(route:Route)=>{
    const req=route.request(),path=new URL(req.url()).pathname,method=req.method();
    const user=req.headers().authorization?.replace(/^Bearer\s+token-/,'')??'';
    let json:unknown={ok:true},status=200;
    if(method==='OPTIONS') return route.fulfill({status:204,headers:cors});
    if(path==='/api/packs') json=packs;
    else if(path.startsWith('/api/packs/')) json=words.map(word=>({word,locale:path.split('/')[3],difficulty:1}));
    else if(path.startsWith('/api/audio/')) {status=404;json={error:'no audio'}}
    else if(path==='/api/leaderboard') json=[];
    else if(path==='/api/auth/login' || path==='/api/auth/register') {
      const username=req.postDataJSON().username;
      accounts[username]??={attempts:[],tests:[]};json={token:`token-${username}`,username};
    } else if(path==='/api/auth/logout') json={ok:true};
    else if(!accounts[user]) {status=401;json={error:'unauthorized'}}
    else if(path==='/api/me') json={id:1,username:user};
    else if(path==='/api/learning') {
      if(method==='POST') {
        const data=req.postDataJSON();
        accounts[user].attempts=[...new Map([...accounts[user].attempts,...data.attempts].map((a:Attempt)=>[a.id,a])).values()];
        accounts[user].tests=[...new Map([...accounts[user].tests,...data.tests].map((r:SavedTest)=>[r.id,r])).values()];
      } else json=accounts[user];
    } else if(path==='/api/words') json=[{id:1,word:'friend',locale:'en',timesSeen:0,timesCorrect:0}];
    else if(path==='/api/stats') {
      if(method==='DELETE') accounts[user]={attempts:[],tests:[]};
      else {const a=accounts[user].attempts;json={...emptyStats,total:a.length,correct:a.filter(a=>a.correct).length,xp:a.filter(a=>a.correct).length*10}}
    } else if(path==='/api/activity') json={days:[],hourly:Array.from({length:24},(_,hour)=>({hour,total:0,correct:0}))};
    else {status=404;json={error:'not found'}}
    return route.fulfill({status,json,headers:cors});
  };
}
async function seedAccount(page:Page,user:string,answers:Attempt[]=[],pending:string[]=[]) {
  await page.addInitScript(({user,answers,pending})=>{
    if(localStorage.getItem('regression-seeded')) return;
    localStorage.setItem('regression-seeded','1');
    localStorage.setItem('st-token',`token-${user}`);localStorage.setItem('st-user',user);
    localStorage.setItem('st-learning',JSON.stringify({[`account:${user}`]:{attempts:answers,tests:[],pending,pendingTests:[]}}));
  },{user,answers,pending});
}

for(const account of [false,true]) test(`settings reset preserves ${account?'account':'guest'} progress`,async({page})=>{
  const a=attempt(),result:SavedTest={id:crypto.randomUUID(),owner:account?'alice':'guest',date:a.date,locale:'en',level:'starter',correct:1,total:1};
  const accounts={alice:{attempts:[a],tests:[result]}};
  await page.route('**/api/**',stubApi(accounts));
  await page.addInitScript(({account,a,result})=>{
    const key=account?'account:alice':'guest';
    if(account) {localStorage.setItem('st-token','token-alice');localStorage.setItem('st-user','alice')}
    localStorage.setItem('st-learning',JSON.stringify({[key]:{attempts:[a],tests:[result],pending:[],pendingTests:[]}}));
    localStorage.setItem('st-stats',JSON.stringify({total:1,correct:1}));localStorage.setItem('st-xp','10');
  },{account,a,result});
  const deletions:string[]=[];page.on('request',r=>{if(r.method()==='DELETE')deletions.push(r.url())});
  await page.goto('/');
  if(account) await expect(page.getByRole('button',{name:'Retry sync',exact:true})).toBeEnabled();
  await expect(page.locator('.brand')).toHaveText('SpellingTeacher');
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.getByRole('button',{name:'Forest',exact:true}).click();
  await page.getByRole('button',{name:'Español',exact:true}).click();
  await page.getByRole('button',{name:'Restablecer todo',exact:true}).click();
  const saved=await page.evaluate(key=>({store:JSON.parse(localStorage.getItem('st-learning')!)[key],locale:localStorage.getItem('st-locale'),theme:JSON.parse(localStorage.getItem('st-theme')!)}),account?'account:alice':'guest');
  expect(saved.store.attempts).toEqual([a]);expect(saved.store.tests).toEqual([result]);
  expect(saved.locale).toBe('en');expect(saved.theme.bg).toBe('#fbfbfd');expect(deletions).toEqual([]);
  expect(accounts.alice.attempts).toEqual([a]);
});

for(const switchLanguage of [false,true]) test(`weakest mode ${switchLanguage?'uses each saved word language':'handles unseen word weights'}`,async({page})=>{
  const answers=words.slice(0,3).map(word=>attempt(word));
  await page.route('**/api/**',stubApi());
  await page.addInitScript(({words,answers})=>{
    Math.random=()=>0;
    localStorage.setItem('st-words',JSON.stringify(words.slice(0,5)));
    localStorage.setItem('st-wstats',JSON.stringify(Object.fromEntries(words.slice(0,3).map(w=>[`en:${w}`,{seen:1,correct:1}]))));
    localStorage.setItem('st-learning',JSON.stringify({guest:{attempts:answers,tests:[],pending:[],pendingTests:[]}}));
  },{words,answers});
  await page.goto('/');
  if(switchLanguage) {
    await page.locator('.pack-row').filter({hasText:'German'}).filter({hasText:'starter'}).getByRole('button',{name:'Use pack',exact:true}).click();
    await page.getByRole('button',{name:'Practice saved words',exact:true}).click();
  }
  const weak=page.getByRole('button',{name:'Weakest first',exact:true});await expect(weak).toBeEnabled();await weak.click();
  await page.locator('input.spell').fill('friend');await page.getByRole('button',{name:'Check',exact:true}).click();
  const next=page.waitForRequest(r=>r.url().includes('/api/audio/en/friend'));
  await page.getByRole('button',{name:'Next →',exact:true}).click();await next;
});

for(const action of ['Login','Register']) test(`${action} persists identity before follow-up requests fail`,async({page})=>{
  await page.route('**/api/**',stubApi());
  let failures=0;
  await page.route('**/api/stats',r=>{failures++;return r.abort()});
  await page.route('**/api/words',r=>r.request().method()==='GET'?r.abort():r.fallback());
  await page.goto('/');await page.getByRole('button',{name:'Account',exact:true}).click();
  await page.getByPlaceholder('username',{exact:true}).fill('alice');await page.getByPlaceholder('password',{exact:true}).fill('test12345');
  if(action==='Register') await page.getByRole('checkbox',{name:'Import guest words, answers and tests when registering'}).uncheck();
  await page.getByRole('button',{name:action,exact:true}).click();
  await expect.poll(()=>failures).toBeGreaterThanOrEqual(2);
  await expect.poll(()=>page.evaluate(()=>localStorage.getItem('st-user'))).toBe('alice');
  await page.unroute('**/api/stats');await page.unroute('**/api/words');await page.reload();
  await expect(page.locator('.account-trigger')).toContainText('alice');
  await expect(page.getByRole('button',{name:'Retry sync',exact:true})).toBeEnabled();
});

test('token-only legacy sessions recover their username',async({page})=>{
  await page.route('**/api/**',stubApi({alice:{attempts:[],tests:[]}}));
  await page.addInitScript(()=>{localStorage.setItem('st-token','token-alice');localStorage.setItem('st-session','{')});
  await page.goto('/');
  await expect(page.locator('.account-trigger')).toContainText('alice');
  expect(await page.evaluate(()=>localStorage.getItem('st-user'))).toBe('alice');
  await expect(page.getByRole('button',{name:'Retry sync',exact:true})).toBeEnabled();
});

test('another tab cannot send or merge history using a different account token',async({page,context})=>{
  const a=attempt('friend'),b=attempt('because');
  const accounts={alice:{attempts:[],tests:[]} as Account,bob:{attempts:[b],tests:[]} as Account};
  const server=stubApi(accounts);await page.route('**/api/**',server);
  await seedAccount(page,'alice',[a],[a.id]);
  const blocked=(r:Route)=>r.request().method()==='POST'?r.abort():r.fallback();
  await page.route('**/api/learning',blocked);
  await page.goto('/');await expect(page.locator('.save-status')).toContainText('sync pending');
  const second=await context.newPage();await second.route('**/api/**',server);await second.goto('/');
  await second.getByRole('button',{name:'Account',exact:true}).click();await second.getByRole('button',{name:'Logout → guest',exact:true}).click();
  await second.getByPlaceholder('username',{exact:true}).fill('bob');await second.getByPlaceholder('password',{exact:true}).fill('test12345');
  await second.getByRole('button',{name:'Login',exact:true}).click();await expect(second.locator('.authbar')).toContainText('Synced as bob');
  await expect(second.getByRole('button',{name:'Retry sync',exact:true})).toBeEnabled();
  await page.unroute('**/api/learning',blocked);
  await page.getByRole('button',{name:'Retry sync',exact:true}).click();await expect(page.locator('.save-status')).toContainText('Progress saved');
  expect(accounts.alice.attempts.map(a=>a.id)).toContain(a.id);expect(accounts.bob.attempts.map(a=>a.id)).not.toContain(a.id);
  const cache=await page.evaluate(()=>JSON.parse(localStorage.getItem('st-learning')!));
  expect(cache['account:alice'].attempts.map((a:Attempt)=>a.id)).not.toContain(b.id);
  expect(cache['account:bob'].attempts.map((a:Attempt)=>a.id)).toContain(b.id);
  await page.getByRole('button',{name:'Account',exact:true}).click();await page.getByRole('button',{name:'Logout → guest',exact:true}).click();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('st-session')!).username)).toBe('bob');
  await second.reload();await expect(second.locator('.account-trigger')).toContainText('bob');
  await second.close();
});

test('switching accounts waits for the new sync and ignores old account responses',async({page})=>{
  const a=attempt('because'),b=attempt('friend'),accounts={alice:{attempts:[a],tests:[]} as Account,bob:{attempts:[],tests:[]} as Account};
  await page.route('**/api/**',stubApi(accounts));
  await page.addInitScript(b=>{
    localStorage.setItem('st-token','token-alice');localStorage.setItem('st-user','alice');
    localStorage.setItem('st-learning',JSON.stringify({'account:alice':{attempts:[],tests:[],pending:[],pendingTests:[]},'account:bob':{attempts:[b],tests:[],pending:[b.id],pendingTests:[]}}));
  },b);
  let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve}),order:string[]=[];
  await page.route('**/api/learning',async r=>{
    const token=r.request().headers().authorization;
    if(token==='Bearer token-alice' && r.request().method()==='GET') await held;
    if(token==='Bearer token-bob' && r.request().method()==='POST') {await new Promise(resolve=>setTimeout(resolve,100));order.push('write')}
    await r.fallback();
  });
  await page.route('**/api/stats',r=>{if(r.request().headers().authorization==='Bearer token-bob')order.push('read');return r.fallback()});
  await page.goto('/');await page.getByRole('button',{name:'Account',exact:true}).click();await page.getByRole('button',{name:'Logout → guest',exact:true}).click();
  await page.getByPlaceholder('username',{exact:true}).fill('bob');await page.getByPlaceholder('password',{exact:true}).fill('test12345');await page.getByRole('button',{name:'Login',exact:true}).click();
  await expect(page.locator('.account-trigger')).toContainText('bob');release();
  await expect.poll(()=>order.includes('read')).toBe(true);expect(order[0]).toBe('write');
  await expect(page.getByRole('button',{name:'Retry sync',exact:true})).toBeEnabled();
  const cache=await page.evaluate(()=>JSON.parse(localStorage.getItem('st-learning')!)['account:bob']);
  expect(cache.attempts.map((a:Attempt)=>a.id)).toEqual([b.id]);
});

test('clear is blocked until a token-only session resolves its account identity',async({page})=>{
  const a=attempt(),accounts={alice:{attempts:[a],tests:[]} as Account};
  await page.route('**/api/**',stubApi(accounts));
  let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve});
  await page.route('**/api/me',async r=>{await held;await r.fallback()});
  await page.addInitScript(a=>{
    localStorage.setItem('st-token','token-alice');localStorage.setItem('st-stats',JSON.stringify({total:1,correct:1}));
    localStorage.setItem('st-learning',JSON.stringify({'account:alice':{attempts:[a],tests:[],pending:[a.id],pendingTests:[]}}));
  },a);
  let deleted=false;page.on('request',r=>{if(r.method()==='DELETE')deleted=true});
  await page.goto('/');const clear=page.getByRole('button',{name:'clear stats',exact:true});await expect(clear).toBeDisabled();
  await clear.evaluate(button=>button.dispatchEvent(new MouseEvent('click',{bubbles:true})));expect(deleted).toBe(false);
  release();await expect(page.locator('.account-trigger')).toContainText('alice');await expect(clear).toBeEnabled();
  await clear.click();await expect.poll(()=>deleted).toBe(true);
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('st-learning')!)['account:alice'].pending)).toEqual([]);
  expect(accounts.alice.attempts).toEqual([]);
});

test('clearing waits for active sync and clears local data before fallible refreshes',async({page})=>{
  const a=attempt(),accounts={alice:{attempts:[a],tests:[]} as Account};
  await page.route('**/api/**',stubApi(accounts));await seedAccount(page,'alice',[a]);await page.goto('/');
  await expect(page.getByRole('button',{name:'Retry sync',exact:true})).toBeEnabled();
  let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve});
  let uploading=false,deleted=false;
  const holdUpload=async(r:Route)=>{if(r.request().method()==='POST'){uploading=true;await held}await r.fallback()};
  const failRefresh=(r:Route)=>{if(r.request().method()==='DELETE')deleted=true;return deleted && r.request().method()==='GET'?r.abort():r.fallback()};
  await page.route('**/api/learning',holdUpload);await page.route('**/api/**',failRefresh);
  await page.locator('input.spell').fill('wrong');await page.getByRole('button',{name:'Check',exact:true}).click();await expect.poll(()=>uploading).toBe(true);
  const clear=page.getByRole('button',{name:'clear stats',exact:true});await clear.click();await expect(clear).toBeDisabled();expect(deleted).toBe(false);
  release();await expect.poll(()=>deleted).toBe(true);
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('st-learning')!)['account:alice'])).toEqual({attempts:[],tests:[],pending:[],pendingTests:[]});
  await page.unroute('**/api/**',failRefresh);await page.unroute('**/api/learning',holdUpload);
  await expect(page.getByRole('button',{name:'Retry sync',exact:true})).toBeEnabled();await page.getByRole('button',{name:'Retry sync',exact:true}).click();
  await expect(page.locator('.save-status')).toContainText('Progress saved');expect(accounts.alice.attempts).toEqual([]);
});

test('a failed clear preserves local progress',async({page})=>{
  const a=attempt();await page.route('**/api/**',stubApi({alice:{attempts:[a],tests:[]}}));await seedAccount(page,'alice',[a]);
  await page.route('**/api/stats',r=>r.request().method()==='DELETE'?r.abort():r.fallback());
  await page.goto('/');await expect(page.getByRole('button',{name:'Retry sync',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'clear stats',exact:true}).click();await expect(page.getByRole('alert')).toBeVisible();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('st-learning')!)['account:alice'].attempts.map((a:Attempt)=>a.id))).toEqual([a.id]);
});

test('invalid historical answers stay local while valid answers continue syncing',async({page})=>{
  const bad={...attempt(),submitted:'a'.repeat(201),correct:false},good=attempt('because');
  const accounts={alice:{attempts:[],tests:[]} as Account};await page.route('**/api/**',stubApi(accounts));
  await seedAccount(page,'alice',[bad,good],[bad.id,good.id]);await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('Some older answers cannot sync');
  expect(accounts.alice.attempts.map(a=>a.id)).toEqual([good.id]);
  await page.locator('input.spell').fill('friend');await page.getByRole('button',{name:'Check',exact:true}).click();
  await expect.poll(()=>accounts.alice.attempts.length).toBe(2);
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('st-learning')!)['account:alice'].pending)).toEqual([bad.id]);
  const saved:LearningStore=await page.evaluate(()=>JSON.parse(localStorage.getItem('st-learning')!)['account:alice']);
  expect(saved.attempts.find(a=>a.id===bad.id)?.submitted).toBe(bad.submitted);expect(saved.pending).toEqual([bad.id]);
});

test('test loading freezes language selection and rejects oversized answers before recording',async({page})=>{
  await page.route('**/api/**',stubApi());
  let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve});
  await page.route('**/api/packs/en/*',async r=>{await held;await r.fallback()});
  await page.goto('/');await page.getByRole('button',{name:'Test',exact:true}).click();
  await page.getByRole('button',{name:'Start test',exact:true}).click();
  await expect(page.getByRole('button',{name:'Spanish',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'Expert',exact:true})).toBeDisabled();
  release();await expect(page.locator('input.spell')).toHaveAttribute('maxlength','200');
  await page.locator('input.spell').evaluate((input:HTMLInputElement)=>{input.value='a'.repeat(201);input.dispatchEvent(new Event('input',{bubbles:true}))});
  await page.getByRole('button',{name:'Check',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Use 1–200 characters');
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('st-learning')!).guest.attempts)).toEqual([]);
  const english=page.waitForRequest(r=>r.url().includes('/api/audio/en/'));
  await page.getByRole('button',{name:'Speak test word',exact:true}).click();await english;
});

for(const [first,last,offset] of [['2026-03-29','2026-03-30','+02:00'],['2026-10-25','2026-10-26','+01:00']]) test(`Berlin best streak crosses ${first}`,async({browser})=>{
  const context=await browser.newContext({timezoneId:'Europe/Berlin',baseURL:'http://localhost:5173'}),page=await context.newPage();
  await page.route('**/api/**',stubApi());await page.clock.setFixedTime(new Date(`${last}T12:00:00${offset}`));
  await page.addInitScript(({first,last})=>localStorage.setItem('st-days',JSON.stringify({[first]:{total:1,correct:1},[last]:{total:1,correct:1}})),{first,last});
  await page.goto('/');await expect(page.locator('header .stats > span').filter({hasText:'📅'})).toContainText('best 2');
  await page.getByRole('button',{name:'Statistics',exact:true}).click();await expect(page.locator('.period-streak')).toContainText('📅 2 day streak (best 2)');
  await context.close();
});
