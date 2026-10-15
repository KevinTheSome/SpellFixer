export type LearningWord = { word:string; locale:string; difficulty?:number|null; variants?:string[] }
export type Attempt = LearningWord & { id:string; submitted:string; date:string; day:string; hour:number; session:string; exercise:'practice'|'test'|'daily'|'weak'; assistance:'none'|'hint'|'copy'|'retry'; correct:boolean; standard:string }
export type SavedTest = { id:string; owner:string; date:string; level:'starter'|'intermediate'|'expert'; locale:string; correct:number; total:number; answers?:Attempt[] }
export const normalize = (s:string) => s.normalize('NFC').trim().toLowerCase()
export const wordKey = (w:LearningWord) => `${w.locale}:${normalize(w.word)}`
export const isCorrect = (w:LearningWord, answer:string) => [w.word, ...(w.variants ?? [])].some(s => normalize(s) === normalize(answer))
export const eligible = (a:Attempt) => a.assistance === 'none'
export function mergeAttempts(a:Attempt[], b:Attempt[]) {
  return [...new Map([...a, ...b].map(x => [x.id, x])).values()].sort((x,y) => x.date.localeCompare(y.date) || x.id.localeCompare(y.id))
}
const DAY = 86400000
export type Review = LearningWord & { key:string; stage:number; due:string; last:string; lastDay:string; successes:number; retained:boolean; recent:Attempt[]; mistakes:number; rate:number }
// Review state is derived from the immutable history, so offline sync cannot overwrite a newer schedule.
export function reviews(attempts:Attempt[]):Review[] {
  const states = new Map<string, Review>()
  for (const a of mergeAttempts([], attempts)) {
    const key = wordKey(a)
    let r = states.get(key)
    if (!r) { r = {word:a.word, locale:a.locale, key, stage:0, due:a.date, last:'', lastDay:'', successes:0, retained:false, recent:[], mistakes:0, rate:0}; states.set(key,r) }
    if (eligible(a)) {
      r.recent.push(a); r.recent = r.recent.slice(-20)
      if (!a.correct) { r.stage=0; r.successes=0; r.retained=false; r.last=a.date; r.lastDay=a.day; r.due=new Date(Date.parse(a.date)+10*60000).toISOString() }
      else if (!r.last || a.day !== r.lastDay && Date.parse(a.date) >= Date.parse(r.due)) {
        r.successes++; r.stage=Math.min(4,r.stage+1)
        r.retained=r.successes>=3 && r.stage>=3
        r.last=a.date; r.lastDay=a.day; r.due=new Date(Date.parse(a.date)+[1,3,7,14][r.stage-1]*DAY).toISOString()
      }
    } else {
      // Assistance never advances mastery or postpones an existing earlier review.
      const soon=new Date(Date.parse(a.date)+10*60000).toISOString()
      r.due=r.last ? (r.due < soon ? r.due : soon) : soon
    }
    r.mistakes=r.recent.filter(x=>!x.correct).length
    r.rate=r.recent.length ? r.mistakes/r.recent.length : 0
  }
  return [...states.values()]
}
export function rankWords(rows:Review[], now=Date.now()) {
  return [...rows].sort((a,b) => Number(Date.parse(b.due)<=now)-Number(Date.parse(a.due)<=now) || b.rate-a.rate || b.mistakes-a.mistakes || a.due.localeCompare(b.due))
}

type EditKind = 'missing'|'extra'|'substituted'|'transposed'
export type Span = { expected:string; typed:string; start:number; end:number; kind:EditKind; position:'start'|'middle'|'end'; before:string; after:string }
const chars = (s:string) => Array.from(new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(normalize(s)), x=>x.segment)
export function align(target:string, submitted:string):{ spans:Span[]; confident:boolean; distance:number } {
  const a=chars(target), b=chars(submitted), n=a.length, m=b.length
  const d=Array.from({length:n+1},()=>Array(m+1).fill(0))
  const paths=Array.from({length:n+1},()=>Array(m+1).fill(1))
  for(let i=0;i<=n;i++) d[i][0]=i
  for(let j=0;j<=m;j++) d[0][j]=j
  for(let i=1;i<=n;i++) for(let j=1;j<=m;j++) {
    const options=[{v:d[i-1][j]+1,p:paths[i-1][j]}, {v:d[i][j-1]+1,p:paths[i][j-1]}, {v:d[i-1][j-1]+Number(a[i-1]!==b[j-1]),p:paths[i-1][j-1]}]
    if(i>1 && j>1 && a[i-1]===b[j-2] && a[i-2]===b[j-1]) options.push({v:d[i-2][j-2]+1,p:paths[i-2][j-2]})
    d[i][j]=Math.min(...options.map(x=>x.v)); paths[i][j]=Math.min(2,options.filter(x=>x.v===d[i][j]).reduce((s,x)=>s+x.p,0))
  }
  const edits:{start:number;end:number;typed:string;kind:EditKind}[]=[]
  let i=n,j=m
  while(i || j) {
    if(i && j && a[i-1]===b[j-1] && d[i][j]===d[i-1][j-1]) {i--;j--;continue}
    if(i>1 && j>1 && a[i-1]===b[j-2] && a[i-2]===b[j-1] && d[i][j]===d[i-2][j-2]+1) {edits.push({start:i-2,end:i,typed:b.slice(j-2,j).join(''),kind:'transposed'});i-=2;j-=2}
    else if(i && j && d[i][j]===d[i-1][j-1]+1) {edits.push({start:i-1,end:i,typed:b[j-1],kind:'substituted'});i--;j--}
    else if(i && d[i][j]===d[i-1][j]+1) {edits.push({start:i-1,end:i,typed:'',kind:'missing'});i--}
    else {edits.push({start:i,end:i,typed:b[j-1],kind:'extra'});j--}
  }
  const spans:Span[]=[]
  for(const e of edits.reverse()) {
    const prev=spans.at(-1)
    if(prev && prev.end===e.start && prev.kind===e.kind) {prev.end=e.end;prev.expected=a.slice(prev.start,e.end).join('');prev.typed+=e.typed}
    else spans.push({...e, expected:a.slice(e.start,e.end).join(''),position:'middle',before:'',after:''})
  }
  for(const s of spans) {s.position=s.start===0?'start':s.end===n?'end':'middle';s.before=a.slice(Math.max(0,s.start-1),s.start).join('');s.after=a.slice(s.end,s.end+1).join('')}
  // Repeated identical letters have equivalent deletion paths but the same observable doubled-letter change.
  const doubled=spans.length===1 && spans[0].kind==='missing' && spans[0].expected.length===1 && (spans[0].before===spans[0].expected || spans[0].after===spans[0].expected)
  if(doubled) { const s=spans[0]; if(s.before===s.expected) s.start--; else s.end++; s.expected=a.slice(s.start,s.end).join('');s.typed=s.expected.slice(0,1);s.before=a.slice(Math.max(0,s.start-1),s.start).join('');s.after=a.slice(s.end,s.end+1).join('') }
  return {spans, distance:d[n][m], confident:(paths[n][m]===1 || doubled) && d[n][m]<=Math.max(1,Math.floor(n/3))}
}
export type Pattern = Span & { key:string; locale:string; failures:number; opportunities:number; words:string[]; rate:number }
const patternKey = (locale:string,s:Span) => JSON.stringify([locale,s.expected,s.typed,s.position,s.before,s.after])
export function matchesPattern(word:string,p:Span) {
  const a=chars(word), expected=chars(p.expected)
  if(!expected.length) return false
  for(let i=0;i<=a.length-expected.length;i++) {
    const end=i+expected.length, position=i===0?'start':end===a.length?'end':'middle'
    if(a.slice(i,end).join('')===p.expected && position===p.position && (a[i-1]??'')===p.before && (a[end]??'')===p.after) return true
  }
  return false
}
export function patterns(attempts:Attempt[]):Pattern[] {
  const recent=reviews(attempts).flatMap(r=>r.recent)
  const candidates=new Map<string,Pattern>()
  for(const a of recent.filter(x=>!x.correct)) {
    const result=align(a.word,a.submitted)
    if(!result.confident) continue
    for(const s of result.spans) {
      if(!s.expected) continue
      const key=patternKey(a.locale,s)
      if(!candidates.has(key)) candidates.set(key,{...s,key,locale:a.locale,failures:0,opportunities:0,words:[],rate:0})
    }
  }
  for(const p of candidates.values()) for(const a of recent) {
    if(a.locale!==p.locale || !matchesPattern(a.word,p)) continue
    p.opportunities++
    const result=a.correct ? null : align(a.word,a.submitted)
    if(result?.confident && result.spans.some(s=>patternKey(a.locale,s)===p.key)) {p.failures++; if(!p.words.includes(a.word)) p.words.push(a.word)}
    p.rate=p.failures/p.opportunities
  }
  return [...candidates.values()].filter(p=>p.failures>=3 && p.words.length>=2).sort((a,b)=>b.rate-a.rate || b.failures-a.failures || b.words.length-a.words.length)
}
export function buildLesson(attempts:Attempt[], pool:LearningWord[], locale:string, weak=false, now=Date.now()):LearningWord[] {
  const ranked=rankWords(reviews(attempts).filter(r=>r.locale===locale),now)
  const due=ranked.filter(r=>Date.parse(r.due)<=now)
  const missed=ranked.filter(r=>r.mistakes>0)
  const focus=patterns(attempts).find(p=>p.locale===locale)
  const known=new Set(ranked.map(wordKey))
  const available=pool.filter(w=>w.locale===locale)
  const related=focus ? available.filter(w=>matchesPattern(w.word,focus)).sort((a,b)=>Number(known.has(wordKey(a)))-Number(known.has(wordKey(b)))) : []
  const fresh=available.filter(w=>!known.has(wordKey(w)))
  const chosen=new Map<string,LearningWord>()
  const add=(list:LearningWord[],count:number)=>{let added=0; for(const w of list) if(!chosen.has(wordKey(w)) && chosen.size<10 && added<count){chosen.set(wordKey(w),w);added++}}
  add(due,10);add(missed,weak?5:3);add(related,3);add(fresh,3);add(ranked,10)
  return [...chosen.values()].slice(0,10)
}
