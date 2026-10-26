import {test,expect,type Page,type Route} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {isCorrect,spellingKey,type Attempt,type Curriculum,type SavedTest} from '../../frontend/src/learning';

const curriculum=JSON.parse(readFileSync(new URL('../../backend/content/en/practice.json',import.meta.url),'utf8')) as Curriculum;
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type,Authorization','Access-Control-Allow-Methods':'GET,POST,DELETE,OPTIONS'};

// Fresh profiles cover the new default; the existing suite opts into word-list drills.
test.use({storageState:{cookies:[],origins:[]}});

function mockApi() {
  const account:{attempts:Attempt[];tests:SavedTest[]}={attempts:[],tests:[]};
  const route=async(route:Route)=>{
    const request=route.request(),url=new URL(request.url()),path=url.pathname,method=request.method();
    if(url.origin==='http://localhost:5173') return route.continue();
    if(url.origin!=='http://localhost:3000') return route.abort();
    if(method==='OPTIONS') return route.fulfill({status:204,headers:cors});
    let json:unknown={},status=200;
    if(path==='/api/curriculum') json=curriculum;
    else if(path==='/api/packs' || path==='/api/leaderboard') json=[];
    else if(path==='/api/auth/register' || path==='/api/auth/login') json={token:'writing-test-token',username:request.postDataJSON().username};
    else if(path==='/api/auth/logout') json={ok:true};
    else if(path==='/api/words') json=method==='GET'?[]:{id:1,word:request.postDataJSON().word};
    else if(path==='/api/learning') {
      if(method==='POST') {
        const data=request.postDataJSON();
        const answers=data.attempts.map((a:Attempt)=>{
          const e=curriculum.exercises.find(e=>e.exerciseId===a.exerciseId);
          return {...a,correct:e?isCorrect(e,a.submitted):a.correct};
        });
        account.attempts=[...new Map([...account.attempts,...answers].map((a:Attempt)=>[a.id,a])).values()];
        account.tests=[...new Map([...account.tests,...data.tests].map((a:SavedTest)=>[a.id,a])).values()];
        json={ok:true};
      } else json=account;
    } else if(path==='/api/stats') {
      const answers=account.attempts.filter(a=>a.assistance==='none' && a.exercise!=='test');
      const correct=answers.filter(a=>a.correct).length;
      json={total:answers.length,correct,accuracy:answers.length?correct/answers.length*100:0,streak:0,best:0,dayStreak:0,bestDayStreak:0,activeDays:0,xp:new Set(answers.filter(a=>a.correct).map(a=>a.day+spellingKey(a))).size*10,level:0,xpPrev:0,xpNext:100};
    } else if(path==='/api/activity') json={days:[],hourly:[]};
    else {status=404;json={error:'not found'}};
    return route.fulfill({headers:cors,status,json});
  };
  return {account,route};
}

test.beforeEach(async({page})=>{
  await page.route('**/*',mockApi().route);
});

async function answer(page:Page,text:string) {
  await page.getByLabel('Your spelling',{exact:true}).fill(text);
  await page.getByRole('button',{name:'Check',exact:true}).click();
}

async function currentExercise(page:Page) {
  const prompt=await page.locator('#exercise-prompt').textContent();
  const exercise=curriculum.exercises.find(e=>e.prompt===prompt);
  expect(exercise,`Unknown exercise prompt: ${prompt}`).toBeTruthy();
  return exercise!;
}

test('default practice is typed correction with explanations, assisted retries and a mistake notebook',async({page})=>{
  const audio:string[]=[];
  page.on('request',r=>{if(r.url().includes('/api/audio/')) audio.push(r.url())});
  await page.goto('/');
  await expect(page.getByRole('button',{name:'Correct spelling',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('#exercise-prompt')).toContainText('becaus');
  await expect(page.getByRole('button',{name:'Speak word',exact:true})).toHaveCount(0);
  await answer(page,'becaus');
  await expect(page.locator('.answer-explanation')).toContainText('final e');
  await expect(page.locator('.contrast-example')).toContainText('not becaus');
  await page.getByRole('button',{name:'Try again',exact:true}).click();
  await expect(page.locator('.answer-explanation')).toHaveCount(0);
  await answer(page,'because');
  const attempts=await page.evaluate(()=>JSON.parse(localStorage.getItem('st-learning')!).guest.attempts);
  expect(attempts.map((a:Attempt)=>a.assistance)).toEqual(['none','retry']);
  expect(attempts.map((a:Attempt)=>a.exerciseId)).toEqual(['spelling_because_01','spelling_because_01']);
  await page.getByRole('button',{name:'Statistics',exact:true}).click();
  await expect(page.locator('.skill-progress')).toContainText('0/1');
  await page.locator('.notebook-entry summary').click();
  await expect(page.locator('.notebook-entry')).toContainText('Because ends in -cause');
  await expect(page.getByRole('button',{name:'Practise this mistake',exact:true})).toBeVisible();
  expect(audio).toEqual([]);
});

test('daily lessons teach before practice, mix skills and keep all eight main questions plus two delayed retries',async({page})=>{
  const audio:string[]=[];
  page.on('request',r=>{if(r.url().includes('/api/audio/'))audio.push(r.url())});
  await page.goto('/');
  await expect(page.locator('#exercise-prompt')).toBeVisible();
  await page.getByRole('button',{name:'Start daily lesson',exact:true}).click();
  await expect(page.getByRole('region',{name:'One-minute lesson'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Put it into practice →',exact:true})).toBeFocused();
  await expect(page.getByLabel('Your spelling',{exact:true})).toHaveCount(0);
  let count=0,lessons=0;
  while(!await page.locator('.lesson-summary').count()) {
    if(await page.locator('.micro-lesson').count()) {await page.getByRole('button',{name:'Put it into practice →',exact:true}).click();lessons++}
    await currentExercise(page);
    await answer(page,'wrong');
    await page.getByRole('button',{name:'Continue → review later',exact:true}).click();
    expect(++count).toBeLessThanOrEqual(10);
  }
  expect(count).toBe(10);
  expect(lessons).toBe(3);
  const attempts:Attempt[]=await page.evaluate(()=>JSON.parse(localStorage.getItem('st-learning')!).guest.attempts);
  expect(attempts.filter(a=>a.assistance==='none')).toHaveLength(8);
  expect(attempts.filter(a=>a.assistance==='retry')).toHaveLength(2);
  expect(new Set(attempts.map(a=>a.exerciseId)).size).toBe(8);
  expect(audio).toEqual([]);
  await expect(page.locator('.lesson-summary')).toContainText('Next review');
  await expect(page.locator('.lesson-summary')).toBeFocused();
});

test('skill practice survives navigation, and notebook review of a revealed answer stays assisted',async({page})=>{
  await page.goto('/');
  await expect(page.locator('#exercise-prompt')).toBeVisible();
  await answer(page,'wrong');
  await page.getByRole('button',{name:'Statistics',exact:true}).click();
  await page.locator('.notebook-entry summary').click();
  await page.getByRole('button',{name:'Practise this mistake',exact:true}).click();
  await expect(page.locator('.micro-lesson')).toContainText('Common spelling patterns');
  let completed=false;
  for(let i=0;i<8;i++) {
    if(await page.locator('.micro-lesson').count()) await page.getByRole('button',{name:'Put it into practice →',exact:true}).click();
    const exercise=await currentExercise(page);
    await page.getByLabel('Your spelling',{exact:true}).fill(exercise.word);
    await page.getByRole('button',{name:'Settings',exact:true}).click();
    await page.getByRole('button',{name:'Practice',exact:true}).click();
    await expect(page.getByLabel('Your spelling',{exact:true})).toHaveValue(exercise.word);
    await page.getByRole('button',{name:'Check',exact:true}).click();
    if(exercise.exerciseId==='spelling_because_01') {completed=true;break}
    await page.getByRole('button',{name:'Next →',exact:true}).click();
  }
  expect(completed).toBe(true);
  const attempts:Attempt[]=await page.evaluate(()=>JSON.parse(localStorage.getItem('st-learning')!).guest.attempts);
  expect(attempts.at(-1)).toMatchObject({exerciseId:'spelling_because_01',correct:true,assistance:'retry'});
});

test('downloaded content and progress survive reload when the curriculum endpoint is unavailable',async({page})=>{
  await page.goto('/');
  await expect(page.locator('#exercise-prompt')).toBeVisible();
  await answer(page,'because');
  await page.route('**/api/curriculum',route=>route.abort());
  await page.reload();
  await expect(page.locator('#exercise-prompt')).toBeVisible();
  const attempts=await page.evaluate(()=>JSON.parse(localStorage.getItem('st-learning')!).guest.attempts);
  expect(attempts).toHaveLength(1);
  expect(attempts[0].correct).toBe(true);
});

test('first-load failure has a recovery action instead of an unusable exercise',async({page})=>{
  await page.route('**/api/curriculum',route=>route.fulfill({headers:cors,status:503,json:{error:'offline'}}));
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('Could not load writing practice');
  await expect(page.getByRole('button',{name:'Start daily lesson',exact:true})).toBeDisabled();
  await page.unroute('**/api/curriculum');
  await page.getByRole('button',{name:'Try again',exact:true}).click();
  await expect(page.locator('#exercise-prompt')).toBeVisible();
});

test('hint-assisted spelling is retained as study, not independent skill evidence',async({page})=>{
  await page.goto('/');
  await expect(page.locator('#exercise-prompt')).toBeVisible();
  await page.getByRole('button',{name:'Show hint 💡',exact:true}).click();
  await answer(page,'because');
  const attempts:Attempt[]=await page.evaluate(()=>JSON.parse(localStorage.getItem('st-learning')!).guest.attempts);
  expect(attempts[0]).toMatchObject({correct:true,assistance:'hint'});
  await page.getByRole('button',{name:'Statistics',exact:true}).click();
  await expect(page.locator('.skill-progress')).toHaveCount(0);
  await expect(page.locator('.retention-cards')).toContainText('Learning');
});

test('mobile writing supports keyboard submission, dark themes and reduced motion without horizontal overflow',async({page},testInfo)=>{
  await page.setViewportSize({width:375,height:812});
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/');
  await expect(page.locator('#exercise-prompt')).toBeVisible();
  await page.getByLabel('Your spelling',{exact:true}).fill('because');
  await page.getByLabel('Your spelling',{exact:true}).press('Enter');
  await expect(page.locator('.answer-explanation')).toBeVisible();
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.getByRole('button',{name:'Forest',exact:true}).click();
  await page.getByRole('button',{name:'Practice',exact:true}).click();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  expect(await page.locator('.spell').evaluate(el=>getComputedStyle(el).transitionDuration)).toBe('0s');
  const next=page.getByRole('button',{name:'Next →',exact:true});
  expect((await next.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.screenshot({path:testInfo.outputPath('writing-mobile.png'),fullPage:true});
});

for(const [id,submitted] of [['spelling_colour_01','color'],['apostrophe_dont_01','don’t']]) {
  test(`typed ${submitted} is accepted for ${id}`,async({page})=>{
    const exercise=curriculum.exercises.find(e=>e.exerciseId===id)!;
    await page.route('**/api/curriculum',route=>route.fulfill({headers:cors,json:{...curriculum,exercises:[exercise]}}));
    await page.goto('/');
    await expect(page.locator('#exercise-prompt')).toBeVisible();
    await answer(page,submitted);
    await expect(page.locator('.ok')).toBeVisible();
    await expect(page.locator('.answer-explanation')).toContainText(exercise.explanation);
  });
}

test('guest writing history imports to an account without deleting the guest copy',async({page})=>{
  const server=mockApi();
  await page.route('**/*',server.route);
  await page.goto('/');
  await expect(page.locator('#exercise-prompt')).toBeVisible();
  await answer(page,'because');
  await page.getByRole('button',{name:'Account',exact:true}).click();
  await page.getByPlaceholder('username',{exact:true}).fill('writing-learner');
  await page.getByPlaceholder('password',{exact:true}).fill('test12345');
  await page.getByRole('button',{name:'Register',exact:true}).click();
  await expect(page.locator('.save-status')).toContainText('Progress saved');
  await expect.poll(()=>server.account.attempts.length).toBe(1);
  expect(server.account.attempts[0]).toMatchObject({exerciseId:'spelling_because_01',skill:'common_spelling',correct:true});
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('st-learning')!));
  expect(saved.guest.attempts).toHaveLength(1);
  expect(saved['account:writing-learner'].attempts).toHaveLength(1);
  await page.getByRole('button',{name:'Logout → guest',exact:true}).click();
  await expect(page.locator('.account-trigger')).toContainText('Login');
  await page.getByRole('button',{name:'Statistics',exact:true}).click();
  await expect(page.locator('.skill-progress')).toContainText('1/1');
});
