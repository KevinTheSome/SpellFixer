import { afterEach, beforeEach, expect, test } from 'bun:test';
import { emptyLearning, guestProgress, readLearning, saveLearning } from '../../frontend/src/learningStorage.ts';
import type { Attempt, LearningStore, SavedTest } from '../../frontend/src/learning.ts';

const descriptors=['localStorage','navigator'].map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)] as const);
let values:Map<string,string>;
beforeEach(()=>{
  values=new Map();
  let tail=Promise.resolve();
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{
    getItem:(key:string)=>values.get(key)??null,
    setItem:(key:string,value:string)=>values.set(key,value),
  }});
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{locks:{
    request:(_name:string,run:()=>unknown)=>{
      const result=tail.then(run);
      tail=result.then(()=>{},()=>{});
      return result;
    },
  }}});
});
afterEach(()=>{
  for(const [name,descriptor] of descriptors) {
    if(descriptor) Object.defineProperty(globalThis,name,descriptor);
    else Reflect.deleteProperty(globalThis,name);
  }
});

function answer(correct=true):Attempt {
  return {id:crypto.randomUUID(),session:crypto.randomUUID(),word:'friend',locale:'en',submitted:correct?'friend':'wrong',date:new Date().toISOString(),day:'2026-11-15',hour:12,exercise:'practice',assistance:'none',correct,standard:'default'};
}

test('concurrent guest saves preserve both answers, tests and consistent totals',async()=>{
  const a={...emptyLearning(),attempts:[answer()]},b={...emptyLearning(),attempts:[answer(false)]};
  const result:SavedTest={id:crypto.randomUUID(),owner:'guest',date:new Date().toISOString(),level:'starter',locale:'en',correct:1,total:1};
  a.tests.push(result);
  await Promise.all([saveLearning('guest',a),saveLearning('guest',b)]);
  const saved=readLearning().guest;
  expect(saved.attempts).toHaveLength(2);
  expect(saved.tests).toEqual([result]);
  expect(guestProgress(saved)).toMatchObject({stats:{total:2,correct:1},xp:10,days:{'2026-11-15':{total:2,correct:1}}});
});

test('a stale save cannot restore guest history after a reset',async()=>{
  const stale={...emptyLearning(),attempts:[answer()]};
  await saveLearning('guest',stale);
  const reset:LearningStore={...emptyLearning(),generation:crypto.randomUUID(),legacy:{ids:[],stats:{total:0,correct:0,streak:0,best:0},xp:0,days:{},hours:{},words:{}}};
  await saveLearning('guest',reset,[],[],true);
  stale.attempts.push(answer());
  expect((await saveLearning('guest',stale)).stale).toBe(true);
  expect(readLearning().guest.attempts).toEqual([]);
  expect(guestProgress(readLearning().guest).stats.total).toBe(0);
});

test('an acknowledged upload is not requeued by an older tab',async()=>{
  const event=answer(), a={...emptyLearning(),attempts:[event],pending:[event.id]}, b=structuredClone(a);
  await saveLearning('account:key',a);
  a.pending=[];
  await saveLearning('account:key',a,[event.id]);
  await saveLearning('account:key',b);
  expect(readLearning()['account:key'].pending).toEqual([]);
});

test('legacy counters survive migration without counting old answers twice',async()=>{
  const old=answer(),next=answer(), data={...emptyLearning(),attempts:[old]};
  values.set('st-learning',JSON.stringify({guest:data}));
  values.set('st-stats',JSON.stringify({total:5,correct:4,streak:2,best:3}));
  values.set('st-xp','40');
  await saveLearning('guest',data);
  data.attempts.push(next);
  await saveLearning('guest',data);
  expect(guestProgress(readLearning().guest)).toMatchObject({stats:{total:6,correct:5,streak:3,best:3},xp:40});
});

test('unsupported locking fails visibly instead of doing an unsafe overwrite',async()=>{
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{}});
  await expect(saveLearning('guest',emptyLearning())).rejects.toThrow('Web Locks');
  expect(values.has('st-learning')).toBe(false);
});
