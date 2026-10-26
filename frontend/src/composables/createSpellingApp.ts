import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { api, isLoggedIn, type PackMeta, type PackEntry, type Stats } from '../api'
import { xpProgress, XP_PER_CORRECT } from '../xp'
import { normalize, wordKey, spellingKey, isCorrect, eligible, mergeAttempts, reviews, patterns, align, buildLesson, queueLessonRetry, validAnswer, learningBatch, type LearningStore, type Attempt, type LearningWord, type SavedTest, type Curriculum } from '../learning'
import { useI18n } from '../i18n'
import { localDay, shuffled } from '../utils'
import { useTheme } from './useTheme'
import { useAudio } from './useAudio'
import { useSelfTest, LS_TEST_RESULTS } from './useSelfTest'
import { useStatistics, type DayStat, type WordMeta } from './useStatistics'

const DEFAULT_WORDS = ['because','beautiful','friend','necessary','accommodate','rhythm','definitely','separate','occasion','embarrass']
const LS_WORDS = 'st-words'
const LS_PACK = 'st-pack'
const LS_CONTENT_LOCALE = 'st-content-locale'
const LS_STATS = 'st-stats'
const LS_DAYS = 'st-days'
const LS_HOURS = 'st-hours'
const LS_WSTATS = 'st-wstats'
const LS_XP = 'st-xp'
const LS_DRILL = 'st-drill'

type WStat = { seen:number, correct:number }
type Lesson = {kind:'daily'|'weak';items:(LearningWord & {retry?:boolean})[];position:number;session:string;complete:boolean;focus:string;teaching:boolean;taught:string[]}
function migrateStats(raw: any): Stats {
  return { total:0, correct:0, streak:0, best:0, dayStreak:0, bestDayStreak:0, activeDays:0, xp:0, level:0, xpPrev:0, xpNext:100, ...raw }
}

// Created once by App: page changes must not reset practice, tests, or in-flight account sync.
export function createSpellingApp() {
  const i18n = useI18n()
  const { locale, t, langName } = i18n
  const appearance = useTheme()
  function resetAll(){ appearance.resetTheme(); locale.value='en' }

  const words = ref<string[]>(JSON.parse(localStorage.getItem(LS_WORDS) || 'null') ?? [...DEFAULT_WORDS])
  const stats = ref<Stats>(migrateStats(JSON.parse(localStorage.getItem(LS_STATS) || 'null')))
  const guestXp = ref(Number(localStorage.getItem(LS_XP) || '0') || 0)
  watch(guestXp, v => localStorage.setItem(LS_XP, String(v)))
  const currentXp = computed(() => mode.value === 'auth' ? (stats.value.xp ?? 0) : guestXp.value)
  const levelInfo = computed(() => xpProgress(currentXp.value))
  const xpPct = computed(() => {
    const { prev, next } = levelInfo.value
    return next > prev ? Math.min(100, Math.round((currentXp.value - prev) / (next - prev) * 100)) : 100
  })

  const dayStats = ref<Record<string,DayStat>>(JSON.parse(localStorage.getItem(LS_DAYS) || 'null') ?? {})
  watch(dayStats, v => localStorage.setItem(LS_DAYS, JSON.stringify(v)), { deep:true })
  const hourStats = ref<Record<string, number[]>>(JSON.parse(localStorage.getItem(LS_HOURS) || 'null') ?? {})
  watch(hourStats, v => localStorage.setItem(LS_HOURS, JSON.stringify(v)), { deep:true })
  function bumpHour(day: string, hour: number) {
    const arr = hourStats.value[day] ?? (hourStats.value[day] = Array(24).fill(0))
    arr[hour] = (arr[hour] ?? 0) + 1
  }
  const wstats = ref<Record<string,WStat>>(JSON.parse(localStorage.getItem(LS_WSTATS) || 'null') ?? {})
  function ensureWStats(list:string[]){
    for(const w of list) if(!wstats.value[w]) wstats.value[w] = { seen:0, correct:0 }
  }
  ensureWStats(words.value)

  const backendWords = ref<{id:number,word:string,locale:string,timesSeen:number,timesCorrect:number}[]>([])
  const mode = ref<'guest'|'auth'>(isLoggedIn() ? 'auth' : 'guest')
  const authUser = ref<string>(api.getUsername())
  const authForm = ref({ username: '', password: '', error: '' })
  const authLoading = ref(false)
  const view = ref<'practice'|'words'|'test'|'stats'|'settings'>('practice')

  const guestLanguages = ref<Record<string,string>>(JSON.parse(localStorage.getItem('st-word-languages') || '{}'))
  const guestExtraWords = ref<LearningWord[]>(JSON.parse(localStorage.getItem('st-extra-words') || '[]'))
  watch(guestLanguages,v=>localStorage.setItem('st-word-languages',JSON.stringify(v)),{deep:true})
  watch(guestExtraWords,v=>localStorage.setItem('st-extra-words',JSON.stringify(v)),{deep:true})
  const savedWords = computed<LearningWord[]>(() => mode.value==='auth' ? backendWords.value : [...words.value.map(word=>({word,locale:guestLanguages.value[word]??'en'})),...guestExtraWords.value])
  const activeWords = ref<LearningWord[]|null>(JSON.parse(localStorage.getItem('st-active-words') || 'null'))
  const drill = ref<'correct'|'seq'|'rand'|'weak'|'repeat'>((localStorage.getItem(LS_DRILL) as any) || 'correct')
  const contentLocale = ref(drill.value==='correct' ? 'en' : localStorage.getItem(LS_CONTENT_LOCALE) || 'en')
  const curriculum = ref<Curriculum>({skills:[],exercises:[]})
  try {
    const cached=JSON.parse(localStorage.getItem('st-curriculum') || 'null')
    if(Array.isArray(cached?.skills) && Array.isArray(cached?.exercises)) curriculum.value=cached
  } catch { /* Public practice content can be downloaded again. */ }
  const curriculumLoading=ref(false), curriculumError=ref('')
  const lesson=ref<Lesson|null>(null)
  watch(activeWords,v=>localStorage.setItem('st-active-words',JSON.stringify(v)),{deep:true})
  const practiceWords = computed(() => lesson.value ? [lesson.value.items[lesson.value.position] ?? lesson.value.items.at(-1)!] : drill.value==='correct' ? curriculum.value.exercises : activeWords.value ?? savedWords.value)
  const displayWords = computed(() => practiceWords.value.map(w=>w.word))
  const idx = ref(Math.floor(Math.random() * displayWords.value.length))
  const input = ref('')
  const feedback = ref<'idle'|'correct'|'wrong'>('idle')
  const newWord = ref('')
  const showList = ref(false)
  const wordError = ref('')
  const wordMessage = ref('')
  const wordSaving = ref(false)

  // Word packs are served by the backend, never hardcoded.
  const packs = ref<PackMeta[]>([])
  const packsLoading = ref(false)
  const packsError = ref('')
  const packApplying = ref('')
  const packEntries = ref<Record<string, PackEntry[]>>({})
  const activePackId = ref(localStorage.getItem(LS_PACK) || '')
  watch(contentLocale, v => localStorage.setItem(LS_CONTENT_LOCALE, v))
  watch(activePackId, v => localStorage.setItem(LS_PACK, v))
  function diffLabel(p: PackMeta): string {
    if (p.minDifficulty == null || p.maxDifficulty == null) return '—'
    return p.minDifficulty === p.maxDifficulty ? `★ ${p.minDifficulty}` : `★ ${p.minDifficulty}–${p.maxDifficulty}`
  }
  async function loadCurriculum() {
    curriculumLoading.value=true;curriculumError.value=''
    try {
      const content=await api.curriculum()
      if(!Array.isArray(content.skills) || !Array.isArray(content.exercises)) throw new Error('invalid curriculum')
      curriculum.value=content
      try { localStorage.setItem('st-curriculum',JSON.stringify(content)) } catch { /* Practice remains available in this session. */ }
    } catch { if(!curriculum.value.exercises.length) curriculumError.value=t('curriculumFailed') }
    finally { curriculumLoading.value=false }
  }
  async function loadPacks() {
    packsLoading.value = true; packsError.value = ''
    try { packs.value = await api.getPacks() }
    catch { packsError.value = t('packsLoadFail') }
    finally { packsLoading.value = false }
    // ponytail: one fetch per pack, cached for stats grouping + hints
    for (const p of packs.value) {
      try {
        const entries: PackEntry[] = await api.getPack(p.locale, p.name)
        packEntries.value[p.id] = entries
        for (const e of entries) {
          const k = wordKey(e)
          if (!wordMeta.value[k]) wordMeta.value[k] = { locale: e.locale, difficulty: e.difficulty ?? null, hint: e.hint, tags: e.tags }
        }
      } catch {}
    }
  }
  async function usePack(p: PackMeta) {
    packApplying.value = p.id
    try {
      const entries = await api.getPack(p.locale, p.name)
      const list = entries.map(e => e.word)
      if (!list.length) return
      contentLocale.value = p.locale
      if(drill.value==='correct') drill.value='rand'
      activePackId.value = p.id
      lesson.value=null; reviewQueue.value=[]
      sessionId.value=crypto.randomUUID()
      activeWords.value = entries
      covered.value=false; retrying.value=false
      idx.value = Math.floor(Math.random() * list.length); input.value = ''; feedback.value = 'idle'; hintShown.value = false
      speak()
    } finally { packApplying.value = '' }
  }

  watch(words, v => { if(mode.value==='guest'){ localStorage.setItem(LS_WORDS, JSON.stringify(v)); ensureWStats(v) } }, { deep:true })
  watch(stats, v => { if(mode.value==='guest') localStorage.setItem(LS_STATS, JSON.stringify(v)) }, { deep:true })
  watch(wstats, v => localStorage.setItem(LS_WSTATS, JSON.stringify(v)), { deep:true })
  const current = computed(() => displayWords.value[idx.value] ?? '')
  const currentWord = computed<LearningWord>(()=>practiceWords.value[idx.value] ?? {word:'',locale:contentLocale.value})
  const accuracy = computed(() => stats.value.total ? Math.round(stats.value.correct / stats.value.total * 100) : 0)
  const { speak } = useAudio(current, currentWord)

  function getWStat(word:string,lang=contentLocale.value): WStat {
    if(mode.value==='auth'){
      const b = backendWords.value.find(x=>x.word===word && x.locale===lang)
      if(b) return { seen:b.timesSeen, correct:b.timesCorrect }
      const local=attempts.value.filter(a=>a.locale===lang && normalize(a.word)===normalize(word) && eligible(a) && a.exercise!=='test')
      return {seen:local.length,correct:local.filter(a=>a.correct).length}
    }
    return wstats.value[`${lang}:${normalize(word)}`] ?? (lang==='en' ? wstats.value[word] : null) ?? { seen:0, correct:0 }
  }
  const wordMeta = ref<Record<string, WordMeta>>({})
  const hintShown = ref(false)
  const retrying = ref(false)
  const covered = ref(false)
  const submitted = ref('')
  const currentMeta = computed(() => wordMeta.value[wordKey(currentWord.value)])
  const currentExercise = computed(()=>curriculum.value.exercises.find(e=>e.exerciseId===currentWord.value.exerciseId))
  const spellingExplanation = computed(()=>currentExercise.value ?? curriculum.value.exercises.find(e=>e.skill==='common_spelling' && spellingKey(e)===spellingKey(currentWord.value)))
  const hintText = computed(() => currentExercise.value?.hint ?? currentMeta.value?.hint ?? '')
  const practiceFocus = computed(() => currentExercise.value ? curriculum.value.skills.find(s=>s.id===currentExercise.value!.skill)?.name ?? '' : currentMeta.value?.tags?.filter(tag=>!['expert','hardest','longest'].includes(tag)).map(tag => tag.replaceAll('-', ' ').trim()).join(', ') ?? '')
  watch(drill, (v,old) => {
    localStorage.setItem(LS_DRILL,v);covered.value=false
    if(v==='correct') contentLocale.value='en'
    if(!lesson.value && (v==='correct' || old==='correct')) {idx.value=0;feedback.value='idle';hintShown.value=false;retrying.value=false;reviewQueue.value=[];sessionId.value=crypto.randomUUID()}
    if(feedback.value==='idle') input.value=''
  })
  const seenCount = computed(() => practiceWords.value.filter(w => getWStat(w.word,w.locale).seen > 0).length)
  const weakUnlocked = computed(() => displayWords.value.length > 0 && seenCount.value > displayWords.value.length / 2)
  const reviewQueue = ref<(LearningWord & {wait:number})[]>([])
  function scheduleReview(word: string) {
    const queued = reviewQueue.value.find(item => wordKey(item)===wordKey(currentWord.value))
    if (queued) queued.wait = 2
    else reviewQueue.value.push({ ...currentWord.value, word, wait:2 })
  }
  function weightedPick(){
    const list = displayWords.value
    if(!list.length) return 0
    // weighted by difficulty: misses + low accuracy get higher weight (ponytail: simple linear weight)
    const weights = practiceWords.value.map(w=>{
      const r=reviewRows.value.find(r=>r.key===wordKey(w))
      return 1 + (r?.rate??0)*4 + Number(!!r && Date.parse(r.due)<=Date.now())*3
    })
    const total = weights.reduce((a,b)=>a+b,0)
    let r = Math.random()*total
    for(let i=0;i<weights.length;i++){ r-=weights[i]; if(r<=0) return i }
    return weights.length-1
  }
  function pickNext() {
    if(lesson.value) { advanceLesson(); return }
    const list = displayWords.value
    retrying.value=false; covered.value=false
    if (list.length <= 1) { input.value=''; feedback.value='idle'; hintShown.value=false; retrying.value=true; return }
    const due = reviewQueue.value.findIndex(item => item.wait === 0 && practiceWords.value.some(w=>wordKey(w)===wordKey(item)))
    if (due >= 0) {const item=reviewQueue.value.splice(due, 1)[0]; idx.value = practiceWords.value.findIndex(w=>wordKey(w)===wordKey(item));retrying.value=true}
    else if (drill.value==='seq') idx.value = (idx.value + 1) % list.length
    else if (drill.value==='weak' && weakUnlocked.value) idx.value = weightedPick()
    else { let n = idx.value; while (n === idx.value) n = Math.floor(Math.random() * list.length); idx.value = n }
    for (const item of reviewQueue.value) item.wait = Math.max(0, item.wait - 1)
    input.value = ''; feedback.value = 'idle'; hintShown.value = false
  }

  // The guest ledger is independent of account caches; logging out always restores guest progress.
  const learningStores = ref<Record<string,LearningStore>>(JSON.parse(localStorage.getItem('st-learning') || '{}'))
  const owner = computed(()=>mode.value==='auth'?`account:${authUser.value}`:'guest')
  watch(owner,key=>{if(!learningStores.value[key])learningStores.value[key]={attempts:[],tests:[],pending:[],pendingTests:[]}},{immediate:true,flush:'sync'})
  const store = computed(()=>learningStores.value[owner.value]!)
  const attempts = computed(()=>store.value.attempts)
  const reviewRows = computed(()=>reviews(attempts.value))
  const supportedPatterns = computed(()=>patterns(attempts.value).filter(p=>p.locale===contentLocale.value))
  const dueCount = computed(()=>reviewRows.value.filter(r=>r.locale===contentLocale.value && (drill.value==='correct' ? !!r.exerciseId : !r.exerciseId) && Date.parse(r.due)<=Date.now()).length)
  const importGuest = ref(true)
  const confirmCustom = ref(false)
  const customLocale = ref('en')
  const saveState = ref<'saved'|'pending'|'saving'|'failed'>('saved')
  const syncError = ref('')
  const resetting = ref(false)
  const sessionId = ref(crypto.randomUUID())
  const pendingCount = computed(()=>store.value.pending.length+store.value.pendingTests.length)
  function persistLearning(key=owner.value) {
    try {
      const saved=JSON.parse(localStorage.getItem('st-learning') || '{}')
      saved[key]=learningStores.value[key]
      localStorage.setItem('st-learning',JSON.stringify(saved))
      saveState.value=mode.value==='auth' && pendingCount.value?'pending':'saved'
    }
    catch {saveState.value='failed'}
  }
  let syncing:Promise<void>|null = null
  function syncLearning():Promise<void> {
    if(syncing) return syncing
    if(mode.value!=='auth' || !authUser.value || resetting.value) return Promise.resolve()
    const key=owner.value, user=authUser.value, data=store.value, token=api.getToken()
    const current=()=>owner.value===key && api.getToken()===token && store.value===data
    saveState.value='saving';syncError.value=''
    let success=false
    syncing=(async()=>{try {
      // Also migrate existing browser-local self-test summaries, without inventing answer text.
      for(const old of testResults.value.filter(r=>r.owner===user)) {
        if(!old.id) old.id=crypto.randomUUID()
        if(!data.tests.some(r=>r.id===old.id)) {data.tests.push(old);data.pendingTests.push(old.id)}
      }
      localStorage.setItem(LS_TEST_RESULTS,JSON.stringify(testResults.value))
      while(data.pending.length || data.pendingTests.length) {
        if(!current()) return
        const batch=learningBatch(data)
        if(!batch.attempts.length && !batch.tests.length) break
        await api.syncLearning(batch.attempts,batch.tests)
        if(!current()) return
        const ids=new Set(batch.attempts.map(a=>a.id)), tests=new Set(batch.tests.map(r=>r.id))
        data.pending=data.pending.filter(id=>!ids.has(id));data.pendingTests=data.pendingTests.filter(id=>!tests.has(id))
        persistLearning(key)
      }
      if(!current()) return
      const remote=await api.learning()
      if(!current()) return
      data.attempts=mergeAttempts(data.attempts,remote.attempts)
      data.tests=[...new Map([...data.tests,...remote.tests].map(r=>[r.id,r])).values()].sort((a,b)=>b.date.localeCompare(a.date))
      persistLearning(key)
      const [s,w]=await Promise.all([api.stats(),api.getWords()])
      if(!current()) return
      stats.value=s;backendWords.value=w;await refreshActivity()
      const remaining=learningBatch(data)
      if(current() && pendingCount.value && !remaining.attempts.length && !remaining.tests.length) syncError.value=locale.value==='es'?'Algunas respuestas antiguas no se pueden sincronizar. Permanecen en este dispositivo; el resto del progreso está guardado.':'Some older answers cannot sync. They remain on this device; other progress is saved.'
      success=true
    } catch {if(current()) saveState.value='pending'}
    })().finally(()=>{
      syncing=null
      const remaining=learningBatch(store.value)
      if(!resetting.value && mode.value==='auth' && (!current() || success && (remaining.attempts.length || remaining.tests.length))) return syncLearning()
    })
    return syncing
  }
  const onOnline = () => { void syncLearning() }
  window.addEventListener('online', onOnline)
  onUnmounted(() => window.removeEventListener('online', onOnline))
  function recordAnswer(w:LearningWord,answer:string,exercise:Attempt['exercise'],assistance:Attempt['assistance'],session:string=sessionId.value):Attempt|null {
    if(resetting.value || mode.value==='auth' && !authUser.value) return null
    if(!validAnswer(answer)) {syncError.value=locale.value==='es'?'Usa entre 1 y 200 caracteres para tu respuesta.':'Use 1–200 characters for your answer.';return null}
    const a:Attempt={id:crypto.randomUUID(),word:w.word,locale:w.locale,...(w.exerciseId?{exerciseId:w.exerciseId,skill:w.skill,variants:w.variants,caseSensitive:w.caseSensitive}:{}),submitted:answer.normalize('NFC').trim(),date:new Date().toISOString(),day:localDay(),hour:new Date().getHours(),session,exercise,assistance,correct:isCorrect(w,answer),standard:'default'}
    const rewarded=attempts.value.some(x=>spellingKey(x)===spellingKey(a) && x.day===a.day && x.correct && eligible(x) && x.exercise!=='test')
    store.value.attempts.push(a)
    if(mode.value==='auth') store.value.pending.push(a.id)
    else {
      const d=dayStats.value[a.day]??(dayStats.value[a.day]={total:0,correct:0});d.total++;if(a.correct)d.correct++
      bumpHour(a.day,a.hour)
      if(eligible(a) && exercise!=='test') {
        stats.value.total++
        if(a.correct) {stats.value.correct++;stats.value.streak++;stats.value.best=Math.max(stats.value.best,stats.value.streak);if(!rewarded)guestXp.value+=XP_PER_CORRECT}
        else stats.value.streak=0
        const s=wstats.value[spellingKey(a)]??(wstats.value[spellingKey(a)]={seen:0,correct:0});s.seen++;if(a.correct)s.correct++
      }
    }
    persistLearning();syncLearning()
    return a
  }

  const statistics = useStatistics({ mode, owner, store, stats, view, dayStats, hourStats, attempts, reviewRows, savedWords, wordMeta, curriculum, t, langName })
  const { serverDays, serverHourly, refreshActivity, refreshHourly, refreshBoard } = statistics
  const selfTest = useSelfTest({ contentLocale, mode, authUser, packs, packEntries, store, resetting, recordAnswer, persistLearning, syncLearning, speak })
  const { testResults, testOwner, resetSelfTest } = selfTest

  // Lessons and practice share the same answer ledger and scoring rules.
  const lessonAnswers=computed(()=>lesson.value?attempts.value.filter(a=>a.session===lesson.value!.session):[])
  const lessonFirsts=computed(()=>lessonAnswers.value.filter(eligible))
  const lessonTransfer=computed(()=>lessonFirsts.value.filter(a=>a.correct && !attempts.value.some(old=>old.session!==a.session && wordKey(old)===wordKey(a))))
  const lessonDelayed=computed(()=>lessonFirsts.value.filter(a=>a.correct && reviewRows.value.some(r=>r.key===wordKey(a) && r.stage>=2 && r.last===a.date)))
  const lessonNeedsReview=computed(()=>reviewRows.value.filter(r=>lessonAnswers.value.some(a=>wordKey(a)===r.key) && !r.recent.at(-1)?.correct))
  const nextReview=computed(()=>reviewRows.value.filter(r=>!lesson.value || lessonAnswers.value.some(a=>wordKey(a)===r.key)).map(r=>r.due).sort()[0])
  const lessonSkill=computed(()=>lesson.value?.teaching ? curriculum.value.skills.find(s=>s.id===currentWord.value.skill) : undefined)
  function finishTeaching() {
    if(!lesson.value) return
    if(currentWord.value.skill) lesson.value.taught.push(currentWord.value.skill)
    lesson.value.teaching=false
  }
  function writingPractice() {
    if(drill.value==='correct' && !lesson.value) return
    manualPractice();drill.value='correct';contentLocale.value='en'
  }
  function manualPractice() {
    if(drill.value==='correct') drill.value='rand'
    sessionId.value=crypto.randomUUID()
    lesson.value=null;activeWords.value=null;activePackId.value='';reviewQueue.value=[];idx.value=0;input.value='';feedback.value='idle';hintShown.value=false;retrying.value=false;covered.value=false
  }
  function startLesson(weak=false,list?:(LearningWord & {retry?:boolean})[]) {
    const selected=activeWords.value??savedWords.value.filter(w=>w.locale===contentLocale.value)
    const ceiling=activeWords.value?Math.max(...activeWords.value.map(w=>w.difficulty??3)):3
    const bundled=Object.values(packEntries.value).flat().filter(w=>w.locale===contentLocale.value && (w.difficulty??3)<=ceiling)
    const pool=drill.value==='correct' ? curriculum.value.exercises : [...new Map([...selected,...bundled].map(w=>[wordKey(w),w])).values()]
    const items=shuffled(list?.slice(0,8)??buildLesson(attempts.value,pool,contentLocale.value,weak))
    if(!items.length) return
    const p=drill.value==='correct' ? undefined : supportedPatterns.value[0]
    const focus=p?(locale.value==='es'?`Has escrito «${p.typed || '∅'}» en lugar de «${p.expected}» (${p.position}). Repasaremos esa diferencia.`:`You have sometimes typed “${p.typed || '∅'}” instead of “${p.expected}” (${p.position}). Let's review this spelling difference.`)+` ${p.failures}/${p.opportunities}.`:''
    lesson.value={kind:weak?'weak':'daily',items,position:0,session:crypto.randomUUID(),complete:false,focus,teaching:!!items[0]?.skill,taught:[]}
    view.value='practice';idx.value=0;input.value='';feedback.value='idle';hintShown.value=false;retrying.value=!!(items[0] as {retry?:boolean})?.retry;covered.value=false;reviewQueue.value=[]
    if(!currentExercise.value) speak()
  }
  function practiceSkill(skill:string) {
    writingPractice()
    startLesson(true,buildLesson(attempts.value,curriculum.value.exercises.filter(e=>e.skill===skill),'en',true))
  }
  function practiceMistake(w:LearningWord) {
    if(w.exerciseId) {
      const item=curriculum.value.exercises.find(e=>e.exerciseId===w.exerciseId)
      if(!item) return
      writingPractice()
      const related=buildLesson(attempts.value,curriculum.value.exercises.filter(e=>e.skill===item.skill),'en',true).filter(e=>wordKey(e)!==wordKey(item)).slice(0,7)
      startLesson(true,[{...item,retry:true},...related])
    } else {
      manualPractice();contentLocale.value=w.locale
      startLesson(true,[{...w,retry:true}])
    }
  }
  function advanceLesson() {
    const l=lesson.value
    if(!l) return
    l.position++
    if(l.position>=l.items.length) {l.complete=true;return}
    idx.value=0;input.value='';feedback.value='idle';hintShown.value=false;covered.value=false;retrying.value=!!l.items[l.position].retry
    l.teaching=!!l.items[l.position].skill && !l.taught.includes(l.items[l.position].skill!)
  }
  function retryWord() {retrying.value=true;covered.value=true;input.value='';feedback.value='idle';hintShown.value=false;if(!currentExercise.value)speak()}
  function continueWord() {pickNext();if(!lesson.value?.complete && !currentExercise.value)speak()}
  function practiceTestMistakes(result:SavedTest) {
    const missed=result.answers?.filter(a=>!a.correct)??[]
    manualPractice()
    contentLocale.value=result.locale
    startLesson(true,[...new Map(missed.map(a=>[wordKey(a),{word:a.word,locale:a.locale,retry:true}])).values()])
  }
  const correctionSpans=computed(()=>align(current.value,submitted.value).spans)
  async function check() {
    if (feedback.value!=='idle' || lesson.value?.teaching || !input.value.trim() || !current.value) return
    submitted.value=input.value.trim()
    const repeated=attempts.value.some(a=>a.session===(lesson.value?.session??sessionId.value) && wordKey(a)===wordKey(currentWord.value))
    const visible=showList.value && savedWords.value.some(w=>spellingKey(w)===spellingKey(currentWord.value))
    const assistance=hintShown.value?'hint':retrying.value || repeated?'retry':visible || drill.value==='repeat' && !covered.value && !lesson.value?'copy':'none'
    const a=recordAnswer(currentWord.value,input.value,lesson.value?.kind??'practice',assistance,lesson.value?.session??sessionId.value)
    if(!a) return
    feedback.value=a.correct?'correct':'wrong'
    if(!a.correct) {
      if(lesson.value) {
        queueLessonRetry(lesson.value.items,lesson.value.position)
      } else scheduleReview(current.value)
    }
  }
  async function onSubmit() {
    if(feedback.value==='wrong') retryWord()
    else if(feedback.value==='correct') continueWord()
    else check()
  }

  // Personal words: preserve account identity across requests and keep guest data local.
  async function addWord() {
    if (wordSaving.value || resetting.value) return
    const key=owner.value, token=api.getToken()
    const current=()=>owner.value===key && api.getToken()===token
    wordError.value='';wordMessage.value=''
    const w = normalize(newWord.value)
    if (!w) return
    if(w.length>50 || !/^[\p{L}\p{M}’'\- ]+$/u.test(w)) {wordError.value=t('invalidWord');return}
    if (savedWords.value.some(x=>wordKey(x)===wordKey({word:w,locale:customLocale.value}))) {wordError.value=t('duplicateWord');return}
    if(!wordMeta.value[wordKey({word:w,locale:customLocale.value})] && !confirmCustom.value) {wordError.value=t('confirmWord');return}
    wordSaving.value=true
    try {
      if (mode.value==='auth') {
        await api.addWord(w,customLocale.value,confirmCustom.value)
        if(!current()) return
        const words=await api.getWords()
        if(!current()) return
        backendWords.value = words
      } else {
        const list=[...guestExtraWords.value,{word:w,locale:customLocale.value}]
        localStorage.setItem('st-extra-words',JSON.stringify(list))
        guestExtraWords.value=list
      }
      newWord.value='';confirmCustom.value=false;wordMessage.value=t('wordSaved')
      if (displayWords.value.length===1) idx.value=0
    } catch(e:any) {
      if(current()) wordError.value=e.message
    } finally {
      wordSaving.value=false
    }
  }
  async function removeWord(w: LearningWord) {
    if (resetting.value) return
    const key=owner.value, token=api.getToken()
    const current=()=>owner.value===key && api.getToken()===token
    wordError.value='';wordMessage.value=''
    try {
      if (mode.value==='auth') {
        const found = backendWords.value.find(x=>wordKey(x)===wordKey(w))
        if(found) { await api.deleteWord(found.id); if(!current())return; backendWords.value = backendWords.value.filter(x=>x.id!==found.id) }
      } else {
        words.value = words.value.filter(x => x !== w.word || (guestLanguages.value[x]??'en')!==w.locale)
        guestExtraWords.value=guestExtraWords.value.filter(x=>wordKey(x)!==wordKey(w))
      }
      if (idx.value >= displayWords.value.length) idx.value = 0
      feedback.value = 'idle'; input.value = ''
      wordMessage.value=t('wordRemoved')
    } catch(e:any) {if(current())wordError.value=e.message}
  }

  async function resetStats() {
    if(resetting.value || mode.value==='auth' && !authUser.value) return
    const key=owner.value, token=api.getToken(), user=testOwner.value
    resetting.value=true
    try {
      await syncing
      if(owner.value!==key || api.getToken()!==token) return
      if(mode.value==='auth') await api.resetStats()
      learningStores.value[key]={attempts:[],tests:[],pending:[],pendingTests:[]}
      testResults.value=testResults.value.filter(r=>r.owner!==user)
      persistLearning(key)
      if(owner.value!==key || api.getToken()!==token) return
      stats.value=migrateStats({});syncError.value='';reviewQueue.value=[];lesson.value=null;resetSelfTest()
      if(mode.value==='guest') {
        guestXp.value=0;dayStats.value={};hourStats.value={}
        for(const k of Object.keys(wstats.value)) wstats.value[k]={seen:0,correct:0}
      } else {
        backendWords.value=backendWords.value.map(w=>({...w,timesSeen:0,timesCorrect:0}))
        serverDays.value=[];serverHourly.value=Array(24).fill(0)
        await Promise.all([refreshActivity(),refreshHourly(),refreshBoard()])
      }
    } catch(e:any) {if(owner.value===key) syncError.value=e.message}
    finally {resetting.value=false}
  }
  async function logout() {
    if (resetting.value) return
    const token=api.getToken()
    try{ await api.logout() }catch{}
    if(api.getToken()!==token) return
    restoreGuest()
  }
  function restoreGuest() {
    api.setToken(''); authUser.value=''; mode.value='guest'; authForm.value={username:'',password:'',error:''}
    backendWords.value=[];serverDays.value=[];serverHourly.value=Array(24).fill(0);syncError.value=''
    words.value = JSON.parse(localStorage.getItem(LS_WORDS) || 'null') ?? [...DEFAULT_WORDS]
    stats.value = migrateStats(JSON.parse(localStorage.getItem(LS_STATS) || 'null'))
    guestXp.value = Number(localStorage.getItem(LS_XP) || '0') || 0
    wstats.value = JSON.parse(localStorage.getItem(LS_WSTATS) || 'null') ?? {}
    hourStats.value = JSON.parse(localStorage.getItem(LS_HOURS) || 'null') ?? {}
    ensureWStats(words.value)
    idx.value=0
    lesson.value=null; reviewQueue.value=[]; retrying.value=false; covered.value=false; feedback.value='idle';input.value='';resetSelfTest()
  }
  async function deleteAccountData(password: string, removeAccount = false) {
    if (mode.value!=='auth' || !authUser.value || resetting.value || authLoading.value || wordSaving.value) return false
    const key=owner.value, token=api.getToken(), user=authUser.value
    const current=()=>owner.value===key && api.getToken()===token
    resetting.value=true
    try {
      await syncing
      if (!current()) return false
      let session: {token:string,username:string}|undefined
      if (removeAccount) await api.deleteAccount(password)
      else session=await api.deleteAccountData(password)
      if (!current()) return false

      // Clear the device cache before accepting a fresh session, so a reload cannot upload erased answers.
      const remainingTests=testResults.value.filter(r=>r.owner!==user)
      try {
        const cached=JSON.parse(localStorage.getItem('st-learning') || '{}')
        delete cached[key]
        localStorage.setItem('st-learning',JSON.stringify(cached))
        localStorage.setItem(LS_TEST_RESULTS,JSON.stringify(remainingTests))
      } catch {
        saveState.value='failed'
        throw new Error(t('localDeleteFailed'))
      }
      learningStores.value[key]={attempts:[],tests:[],pending:[],pendingTests:[]}
      testResults.value=remainingTests
      backendWords.value=[]; stats.value=migrateStats({}); serverDays.value=[]; serverHourly.value=Array(24).fill(0)
      newWord.value='';wordError.value='';wordMessage.value='';submitted.value='';confirmCustom.value=false
      manualPractice();resetSelfTest();syncError.value='';saveState.value='saved'
      if (session) api.setToken(session.token,session.username)
      else { restoreGuest(); delete learningStores.value[key] }
      await refreshBoard()
      return true
    } finally {
      resetting.value=false
    }
  }
  async function refreshAuthData() {
    if (mode.value !== 'auth') return
    const token=api.getToken()
    try {
      if(!authUser.value) {
        const user=await api.me()
        if(api.getToken()!==token || mode.value!=='auth') return
        api.setToken(token,user.username);authUser.value=user.username
      }
      const key=owner.value, data=store.value
      const current=()=>owner.value===key && api.getToken()===token && store.value===data && !resetting.value
      await syncLearning()
      if(!current()) return
      const [w, s] = await Promise.all([api.getWords(), api.stats()])
      if(!current()) return
      backendWords.value = w
      stats.value = s
      await refreshActivity()
      if(!current()) return
      idx.value = 0
      feedback.value='idle'
      input.value=''
    } catch(e:any){
      if(api.getToken()===token && e.message.includes('unauthorized')) void logout()
    }
  }
  function startSession(r:{token:string;username:string}) {
    api.setToken(r.token,r.username);authUser.value=r.username;mode.value='auth'
    backendWords.value=[];stats.value=migrateStats({});serverDays.value=[];serverHourly.value=Array(24).fill(0)
    resetSelfTest();lesson.value=null;reviewQueue.value=[];feedback.value='idle';input.value='';sessionId.value=crypto.randomUUID();syncError.value=''
  }
  async function login() {
    authForm.value.error=''; authLoading.value=true
    try{
      const r = await api.login(authForm.value.username, authForm.value.password)
      startSession(r); await refreshAuthData(); await refreshBoard()
    } catch(e:any){ authForm.value.error=e.message } finally{ authLoading.value=false }
  }
  async function register() {
    authForm.value.error=''; authLoading.value=true
    try{
      const guest=learningStores.value.guest, guestWords=[...savedWords.value]
      const r = await api.register(authForm.value.username, authForm.value.password)
      startSession(r)
      if(importGuest.value) {
        if(guest) {store.value.attempts=mergeAttempts(store.value.attempts,guest.attempts);store.value.pending=[...new Set([...store.value.pending,...guest.attempts.map(a=>a.id)])];const tests=guest.tests.map(t=>({...t,owner:r.username}));store.value.tests=[...store.value.tests,...tests];store.value.pendingTests.push(...tests.map(t=>t.id));persistLearning()}
        for(const w of guestWords) try{await api.addWord(w.word,w.locale,true)}catch(e:any){if(!e.message.includes('already exists'))authForm.value.error=e.message}
      } else for(const word of DEFAULT_WORDS) await api.addWord(word)
      await refreshAuthData(); await refreshBoard()
    } catch(e:any){ authForm.value.error=e.message } finally{ authLoading.value=false }
  }

  onMounted(async () => {
    loadCurriculum()
    loadPacks()
    refreshBoard()
    for(const old of testResults.value.filter(r=>r.owner===testOwner.value)) {if(!old.id)old.id=crypto.randomUUID();if(!store.value.tests.some(r=>r.id===old.id)){store.value.tests.push(old);if(mode.value==='auth')store.value.pendingTests.push(old.id)}}
    persistLearning()
    if(mode.value==='auth') await refreshAuthData()
    if (displayWords.value.length && drill.value!=='correct'){
      idx.value = 0
      setTimeout(() => speak(true), 600) // no gesture yet: mp3 only, no voice fallback
    }
  })
  return {
    ...i18n, ...appearance, ...statistics, ...selfTest, resetAll,
    view, mode, stats, currentXp, levelInfo, xpPct, accuracy, authUser, authForm, authLoading,
    importGuest, login, register, logout, resetStats, deleteAccountData, resetting, saveState, pendingCount, syncLearning, syncError,
    savedWords, newWord, showList, customLocale, confirmCustom, wordError, wordMessage, wordSaving, addWord, removeWord,
    packs, packsLoading, packsError, activePackId, packApplying, diffLabel, usePack, contentLocale,
    curriculum, curriculumLoading, curriculumError, loadCurriculum, currentExercise, spellingExplanation, writingPractice, lessonSkill, finishTeaching, practiceSkill, practiceMistake,
    lesson, dueCount, displayWords, startLesson, manualPractice, lessonFirsts, lessonAnswers, lessonNeedsReview,
    lessonDelayed, lessonTransfer, nextReview, drill, weakUnlocked, seenCount, speak, hintText, hintShown,
    current, covered, retrying, input, feedback, onSubmit, continueWord, submitted, correctionSpans, practiceFocus, practiceTestMistakes, store,
  }
}
