import { eligible, mergeAttempts, spellingKey, type GuestProgress, type LearningStore } from './learning'
import { XP_PER_CORRECT } from './xp'

export const emptyLearning = ():LearningStore => ({attempts:[],tests:[],pending:[],pendingTests:[]})
export const readLearning = ():Record<string,LearningStore> => JSON.parse(localStorage.getItem('st-learning') || '{}')

export function mergeLearning(saved:LearningStore, local:LearningStore, ack:string[]=[], ackTests:string[]=[]):LearningStore {
  const known=new Set(saved.attempts.map(a=>a.id)), knownTests=new Set(saved.tests.map(r=>r.id))
  return {
    ...saved,
    attempts:mergeAttempts(saved.attempts,local.attempts),
    tests:[...new Map([...saved.tests,...local.tests].map(r=>[r.id,r])).values()].sort((a,b)=>b.date.localeCompare(a.date)),
    // An ID already saved without a pending flag was acknowledged by another tab.
    pending:[...new Set([...saved.pending,...local.pending.filter(id=>!known.has(id))])].filter(id=>!ack.includes(id)),
    pendingTests:[...new Set([...saved.pendingTests,...local.pendingTests.filter(id=>!knownTests.has(id))])].filter(id=>!ackTests.includes(id)),
  }
}

export function guestProgress(data:LearningStore):GuestProgress {
  const result:GuestProgress=JSON.parse(JSON.stringify(data.legacy ?? {stats:{total:0,correct:0,streak:0,best:0},xp:0,days:{},hours:{},words:{}}))
  const previous=new Set(data.legacy?.ids ?? [])
  const rewarded=new Set(data.attempts.filter(a=>previous.has(a.id) && eligible(a) && a.exercise!=='test' && a.correct).map(a=>`${a.day}:${spellingKey(a)}`))
  for(const a of mergeAttempts([],data.attempts)) {
    if(previous.has(a.id)) continue
    const day=result.days[a.day]??(result.days[a.day]={total:0,correct:0})
    day.total++;if(a.correct)day.correct++
    const hours=result.hours[a.day]??(result.hours[a.day]=Array(24).fill(0))
    hours[a.hour]=(hours[a.hour]??0)+1
    if(!eligible(a) || a.exercise==='test') continue
    result.stats.total++
    result.stats.streak=a.correct?result.stats.streak+1:0
    result.stats.best=Math.max(result.stats.best,result.stats.streak)
    const key=spellingKey(a), word=result.words[key]??(result.words[key]={...(result.words[a.word]??{seen:0,correct:0})})
    word.seen++
    if(a.correct) {
      result.stats.correct++;word.correct++
      const reward=`${a.day}:${key}`
      if(!rewarded.has(reward)) {result.xp+=XP_PER_CORRECT;rewarded.add(reward)}
    }
  }
  return result
}

export function learningLock<T>(run:()=>T):Promise<T> {
  if(!navigator.locks) return Promise.reject(new Error('Safe browser saving requires HTTPS or localhost and a browser with Web Locks support.'))
  return navigator.locks.request('st-learning',run)
}

export function saveLearning(key:string, data:LearningStore, ack:string[]=[], ackTests:string[]=[], reset=false) {
  return learningLock(()=>{
    const all=readLearning(), saved=all[key]
    if(!reset && saved && saved.generation!==data.generation) return {data:saved,stale:true}
    const merged=reset?data:mergeLearning(saved??emptyLearning(),data,ack,ackTests)
    if(key==='guest' && !merged.legacy) {
      // Preserve pre-ledger counters once; all later totals come from the merged history.
      merged.legacy={
        ids:(saved?.attempts??[]).map(a=>a.id),
        stats:{total:0,correct:0,streak:0,best:0,...JSON.parse(localStorage.getItem('st-stats') || '{}')},
        xp:Number(localStorage.getItem('st-xp') || '0')||0,
        days:JSON.parse(localStorage.getItem('st-days') || '{}'),
        hours:JSON.parse(localStorage.getItem('st-hours') || '{}'),
        words:JSON.parse(localStorage.getItem('st-wstats') || '{}'),
      }
    }
    all[key]=merged
    localStorage.setItem('st-learning',JSON.stringify(all))
    Object.assign(data,merged)
    return {data,stale:false}
  })
}
