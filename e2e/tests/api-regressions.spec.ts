import {test,expect,type APIRequestContext} from '@playwright/test';
import type {Attempt} from '../../frontend/src/learning';

const base='http://localhost:3000';
async function account(request:APIRequestContext,password='test12345') {
  const username=`regression_${crypto.randomUUID().slice(0,8)}`;
  const response=await request.post(`${base}/api/auth/register`,{data:{username,password}});
  expect(response.ok(),await response.text()).toBeTruthy();
  const auth=await response.json();return {username,password,headers:{Authorization:`Bearer ${auth.token}`}};
}
function answer(correct:boolean,date:string):Attempt {
  return {id:crypto.randomUUID(),session:crypto.randomUUID(),word:'friend',submitted:correct?'friend':'wrong',locale:'en',date,day:date.slice(0,10),hour:12,exercise:'practice',assistance:'none',correct,standard:'default'};
}

test('password whitespace round trips and spaced Bearer logout revokes the session',async({request})=>{
  const user=await account(request,'  test12345  ');
  const response=await request.post(`${base}/api/auth/login`,{data:{username:user.username,password:user.password}});
  expect(response.ok(),await response.text()).toBeTruthy();const auth=await response.json();
  expect((await request.post(`${base}/api/auth/logout`,{headers:{Authorization:`Bearer  ${auth.token}`}})).ok()).toBeTruthy();
  expect((await request.get(`${base}/api/me`,{headers:{Authorization:`Bearer ${auth.token}`}})).status()).toBe(401);
  for(const data of ['null',JSON.stringify({username:123,password:[]})]) {
    for(const path of ['register','login']) expect((await request.post(`${base}/api/auth/${path}`,{data,headers:{'Content-Type':'application/json'}})).status()).toBe(400);
  }
});

test('retired score writer cannot award XP',async({request})=>{
  const {headers}=await account(request);
  const response=await request.post(`${base}/api/words`,{headers,data:{word:'friend'}});expect(response.status()).toBe(201);
  const word=await response.json();
  for(let i=0;i<2;i++) expect((await request.post(`${base}/api/attempts`,{headers,data:{wordId:word.id,correct:true}})).status()).toBe(410);
  const stats=await (await request.get(`${base}/api/stats`,{headers})).json();expect(stats).toMatchObject({total:0,xp:0});
});

test('streaks depend on event time, not upload order or batching',async({request})=>{
  const history=[answer(false,'2026-01-01T12:01:00.000Z'),answer(true,'2026-01-01T12:02:00.000Z'),answer(true,'2026-01-01T12:03:00.000Z')];
  for(const events of [history,[...history].reverse()]) {
    const {headers}=await account(request);
    for(const a of events) {
      const response=await request.post(`${base}/api/learning`,{headers,data:{attempts:[a],tests:[]}});
      expect(response.ok(),await response.text()).toBeTruthy();
    }
    expect(await (await request.get(`${base}/api/stats`,{headers})).json()).toMatchObject({total:3,correct:2,streak:2,best:2,xp:10});
  }
});

test('concurrent clear and sync keep attempts, history and XP consistent',async({request})=>{
  const {headers}=await account(request);
  for(let i=0;i<5;i++) {
    const response=await request.post(`${base}/api/learning`,{headers,data:{attempts:[answer(true,'2026-01-01T12:00:00.000Z')],tests:[]}});
    expect(response.ok(),await response.text()).toBeTruthy();
    const responses=await Promise.all([
      request.delete(`${base}/api/stats`,{headers}),
      request.post(`${base}/api/learning`,{headers,data:{attempts:[answer(true,'2026-01-01T12:01:00.000Z')],tests:[]}}),
    ]);
    for(const response of responses) expect(response.ok(),await response.text()).toBeTruthy();
    const history=await (await request.get(`${base}/api/learning`,{headers})).json();
    const stats=await (await request.get(`${base}/api/stats`,{headers})).json();
    expect(stats.total).toBe(history.attempts.length);expect(stats.correct).toBe(history.attempts.length);
    expect(stats.xp).toBe(history.attempts.length?10:0);
  }
});

test('best calendar-day streak crosses DST with a skipped-day control',async({request})=>{
  // Run the backend with TZ=Europe/Berlin as well as UTC to cover its local-time path.
  const {headers}=await account(request);
  for(const days of [['2026-03-29','2026-03-30'],['2026-03-28','2026-03-30']]) {
    expect((await request.delete(`${base}/api/stats`,{headers})).ok()).toBeTruthy();
    const response=await request.post(`${base}/api/learning`,{headers,data:{attempts:days.map(day=>answer(true,`${day}T12:00:00.000Z`)),tests:[]}});
    expect(response.ok(),await response.text()).toBeTruthy();
    const activity=await (await request.get(`${base}/api/activity?days=7&today=2026-03-30`,{headers})).json();
    expect(activity.bestDayStreak).toBe(days[0]==='2026-03-29'?2:1);
  }
});
