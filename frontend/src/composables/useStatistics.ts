import { ref, computed, watch, type Ref } from 'vue'
import { api, type Stats, type DayActivity, type LeaderEntry } from '../api'
import { eligible, wordKey, spellingKey, reviews, rankWords, patterns, skillStats, type Attempt, type LearningStore, type LearningWord, type Curriculum } from '../learning'
import { XP_PER_CORRECT } from '../xp'
import { localDay } from '../utils'
import type { useI18n } from '../i18n'

type Row = { word: string, seen: number, correct: number, acc: number, locale: string, difficulty: number | null }
export type DayStat = { total:number, correct:number }
export type WordMeta = { locale: string, difficulty: number | null, hint?: string, tags?: string[] }

export function useStatistics({ mode, owner, store, stats, view, dayStats, hourStats, attempts, reviewRows, savedWords, wordMeta, curriculum, t, langName }: {
  mode: Ref<'guest'|'auth'>
  owner: Ref<string>
  store: Ref<LearningStore>
  stats: Ref<Stats>
  view: Ref<string>
  dayStats: Ref<Record<string, DayStat>>
  hourStats: Ref<Record<string, number[]>>
  attempts: Ref<Attempt[]>
  reviewRows: Ref<ReturnType<typeof reviews>>
  savedWords: Ref<LearningWord[]>
  wordMeta: Ref<Record<string, WordMeta>>
  curriculum: Ref<Curriculum>
  t: ReturnType<typeof useI18n>['t']
  langName: (locale:string) => string
}) {
  // One period drives the entire statistics page; the header keeps lifetime account progress.
  const chartRange = ref<'month'|'week'|'day'>('month')
  const rangeDays = computed(()=>chartRange.value==='day'?1:chartRange.value==='week'?7:30)
  const periodStart = computed(()=>{const d=new Date();d.setDate(d.getDate()-rangeDays.value+1);return localDay(d)})
  const periodAttempts = computed(()=>attempts.value.filter(a=>a.day>=periodStart.value && a.day<=localDay()))
  const periodIndependent = computed(()=>periodAttempts.value.filter(eligible))
  const periodPractice = computed(()=>periodIndependent.value.filter(a=>a.exercise!=='test'))
  const periodCorrect = computed(()=>periodPractice.value.filter(a=>a.correct).length)
  const periodAccuracy = computed(()=>accOf(periodPractice.value.length,periodCorrect.value))
  const periodReviews = computed(()=>{
    const active=new Set(periodAttempts.value.map(wordKey))
    return rankWords(reviewRows.value.filter(r=>active.has(r.key)).map(r=>{
      const recent=r.recent.filter(a=>a.day>=periodStart.value && a.day<=localDay())
      const mistakes=recent.filter(a=>!a.correct).length
      return {...r,recent,mistakes,rate:recent.length?mistakes/recent.length:0}
    }))
  })
  const periodPatterns = computed(()=>patterns(periodAttempts.value))
  const periodSkills = computed(()=>skillStats(periodAttempts.value,curriculum.value.exercises))
  const mistakeNotebook = computed(()=>{
    const latest=new Map<string,Attempt>()
    for(const a of periodIndependent.value) if(!a.correct) latest.set(wordKey(a),a)
    return [...latest.values()].sort((a,b)=>b.date.localeCompare(a.date)).map(attempt=>({attempt,exercise:curriculum.value.exercises.find(e=>attempt.exerciseId ? e.exerciseId===attempt.exerciseId : spellingKey(e)===spellingKey(attempt))}))
  })
  const periodStreak = computed(()=>{
    let current=0,best=0
    for(const a of periodPractice.value) {current=a.correct?current+1:0;best=Math.max(best,current)}
    return {current,best}
  })
  const periodDayStreak = computed(()=>streakOf(new Set(heatDays.value.slice(-rangeDays.value).filter(d=>d.total>0).map(d=>d.date))))
  const periodXp = computed(()=>new Set(periodPractice.value.filter(a=>a.correct).map(a=>`${a.day}:${spellingKey(a)}`)).size*XP_PER_CORRECT)

  const board = ref<LeaderEntry[]>([])
  const boardLoading = ref(false)
  async function refreshBoard() {
    boardLoading.value = true
    const range = chartRange.value
    try { const entries = await api.leaderboard(10, rangeDays.value, localDay()); if (chartRange.value===range) board.value = entries }
    catch { board.value = [] }
    finally { boardLoading.value = false }
  }
  watch(chartRange,()=>{board.value=[];refreshBoard()})

  const HEAT_DAYS = 182
  const serverDays = ref<DayActivity[]>([])
  async function refreshActivity() {
    if (mode.value !== 'auth') return
    const key=owner.value,token=api.getToken(),data=store.value
    try {
      const a = await api.activity(HEAT_DAYS, localDay())
      if(owner.value===key && api.getToken()===token && store.value===data) serverDays.value = a.days
    } catch {}
  }
  const guestStreak = computed(() => streakOf(new Set(Object.keys(dayStats.value).filter(k => dayStats.value[k].total > 0))))
  const dayStreak = computed(() => mode.value === 'auth' ? stats.value.dayStreak : guestStreak.value.cur)
  const bestDayStreak = computed(() => mode.value === 'auth' ? stats.value.bestDayStreak : guestStreak.value.best)
  const heatDays = computed<DayActivity[]>(() => {
    if (mode.value === 'auth') return serverDays.value
    const out: DayActivity[] = []
    const today = new Date()
    for (let i = HEAT_DAYS - 1; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      const k = localDay(d)
      const s = dayStats.value[k]
      out.push({ date: k, total: s?.total ?? 0, correct: s?.correct ?? 0 })
    }
    return out
  })
  const serverHourly = ref<number[]>(Array(24).fill(0))
  async function refreshHourly() {
    if (mode.value !== 'auth' || chartRange.value !== 'day') return
    const key=owner.value,token=api.getToken(),data=store.value
    try {
      const r = await api.activityHourly(localDay())
      if(owner.value===key && api.getToken()===token && store.value===data && chartRange.value==='day') serverHourly.value = r.hourly.map(h => h.total)
    } catch {}
  }
  watch([chartRange, () => view.value, () => mode.value], refreshHourly)
  watch(view, v => { if (v === 'stats') { refreshActivity(); refreshHourly(); refreshBoard() } })
  type Bar = { label: string, value: number, title: string }
  const chartBars = computed<Bar[]>(() => {
    if (chartRange.value === 'day') {
      const arr = mode.value === 'auth' ? serverHourly.value : (hourStats.value[localDay()] ?? Array(24).fill(0))
      return arr.map((v, h) => ({ label: String(h), value: v, title: `${h}:00 — ${v} words` }))
    }
    return heatDays.value.slice(-rangeDays.value).map(d => ({ label: d.date.slice(5), value: d.total, title: `${d.date}: ${d.total} words` }))
  })
  const chartMax = computed(() => Math.max(1, ...chartBars.value.map(b => b.value)))
  const chartTotal = computed(() => chartBars.value.reduce((a, b) => a + b.value, 0))

  const perWordRows = computed<Row[]>(()=>{
    const list = [...new Map([...savedWords.value,...periodReviews.value].map(w=>[spellingKey(w),w])).values()]
    return list.map(w=>{
      const answers=periodPractice.value.filter(a=>spellingKey(a)===spellingKey(w))
      const s={seen:answers.length,correct:answers.filter(a=>a.correct).length}; const acc=s.seen? Math.round(s.correct/s.seen*100):0
      const m = wordMeta.value[spellingKey(w)]
      const exercise=curriculum.value.exercises.find(e=>spellingKey(e)===spellingKey(w))
      return { word:w.word, seen:s.seen, correct:s.correct, acc, locale: w.locale, difficulty: m?.difficulty ?? exercise?.difficulty ?? null }
    }).sort((a,b)=> a.acc-b.acc || b.seen-a.seen)
  })
  const BAND_ORDER = ['easy','med','hard','na'] as const
  // One tree: language → difficulty band → words.
  const statTree = computed(()=>{
    const byLang = new Map<string, Row[]>()
    for (const r of perWordRows.value) {
      const k = r.locale || 'other'
      if (!byLang.has(k)) byLang.set(k, [])
      byLang.get(k)!.push(r)
    }
    const bandTitle = { easy: t('easyBand'), med: t('medBand'), hard: t('hardBand'), na: t('unsorted') }
    return [...byLang.entries()]
      .sort((a,b)=> a[0].localeCompare(b[0]))
      .map(([key, rows]) => ({
        key,
        title: key === 'other' ? t('otherLang') : langName(key),
        avg: sectionAvg(rows),
        bands: BAND_ORDER.filter(b => rows.some(r => bandOf(r.difficulty) === b))
          .map(b => {
            const bandRows = rows.filter(r => bandOf(r.difficulty) === b)
            return { key: b, title: bandTitle[b], avg: sectionAvg(bandRows), rows: bandRows }
          })
      }))
  })
  return {
    chartRange, periodAttempts, periodIndependent, periodPractice, periodCorrect, periodAccuracy,
    periodReviews, periodPatterns, periodSkills, mistakeNotebook, periodStreak, periodDayStreak, periodXp, board, boardLoading,
    refreshBoard, serverDays, refreshActivity, dayStreak, bestDayStreak, serverHourly, refreshHourly,
    chartBars, chartMax, chartTotal, perWordRows, statTree,
  }
}

function sectionAvg(rows: Row[]): number | null {
  const total = rows.reduce((a,r)=>a+r.seen,0)
  return total ? Math.round(rows.reduce((a,r)=>a+r.correct,0)/total*100) : null
}
function bandOf(d: number | null): 'easy'|'med'|'hard'|'na' {
  if (d == null) return 'na'
  return d <= 2 ? 'easy' : d <= 4 ? 'med' : 'hard'
}
// Guest day streak uses the same consecutive-calendar-day rule as the backend.
function streakOf(active: Set<string>): { cur:number, best:number } {
  const today = new Date()
  const key = (d: Date) => localDay(d)
  let cur = 0
  const c = new Date(today)
  if (!active.has(key(c))) c.setDate(c.getDate() - 1)
  while (active.has(key(c))) { cur++; c.setDate(c.getDate() - 1) }
  let best = 0, run = 0, prev = 0
  for (const k of [...active].sort()) {
    const time = new Date(k + 'T00:00:00Z').getTime()
    run = prev && time - prev === 864e5 ? run + 1 : 1
    best = Math.max(best, run)
    prev = time
  }
  return { cur, best }
}
export function accOf(total: number, correct: number): number | null {
  return total ? Math.round(correct / total * 100) : null
}
export const fmtAcc = (a: number | null) => a == null ? '—' : `${a}%`
