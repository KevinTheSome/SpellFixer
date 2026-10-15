<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { api, isLoggedIn, type PackMeta, type PackEntry, type Stats, type DayActivity, type LeaderEntry } from './api'
import { levelForXp, xpProgress, XP_PER_CORRECT } from './xp'
import { normalize, wordKey, isCorrect, eligible, mergeAttempts, reviews, rankWords, patterns, align, buildLesson, type Attempt, type LearningWord, type SavedTest } from './learning'

const DEFAULT_WORDS = ['because','beautiful','friend','necessary','accommodate','rhythm','definitely','separate','occasion','embarrass']
const LS_WORDS = 'st-words'
const LS_PACK = 'st-pack'
const LS_CONTENT_LOCALE = 'st-content-locale'
const LS_STATS = 'st-stats'
const LS_DAYS = 'st-days'
const LS_HOURS = 'st-hours'
const LS_WSTATS = 'st-wstats'
const LS_THEME = 'st-theme'
const LS_LOCALE = 'st-locale'
const LS_TEST_RESULTS = 'st-test-results'

// --- i18n (no dep) ---
const dict = {
  en: {
    practice:'Practice', selfTest:'Test', statistics:'Statistics', settings:'Settings',
    listen:'Listen', hint:'Click listen, then spell what you hear',
    typeph:'type spelling...', check:'Check', next:'Next →', retry:'Try again',
    correct:'Nice! 🎉', was:'It was', reveal:'Correct spelling:', hearAgain:'hear again',
    repeatMode:'Repeat', spellThis:'Spell this word:', pasteDisabled:'Paste is disabled in this mode',
    manage:'manage', hide:'hide', wordList:'word list', addph:'add word...', add:'Add',
    noWords:'No words yet. Add some below.', savedLocal:'Saved locally (guest). Login to sync.',
    savedServer:'Saved on server. Per-word stats: seen/correct tracked.',
    guestNote:'Guest mode — works offline. Login to sync.', synced:'Synced as',
    wordsAndStats:'words & stats saved on server.', offline:'Guest (offline) · ', noTracking:'No tracking · Voice via your browser',
    theme:'Theme', preset:'Preset', custom:'Custom', background:'Background', primary:'Primary color', secondary:'Secondary color', textColor:'Text color', font:'Font', resetTheme:'Reset theme',
    lang:'Language', appLangNote:'App language (not word list)',     defSettings:'Defaults', resetAll:'Reset all settings',
    statsTitle:'Per-word statistics', word:'Word', seen:'Times spelled', correctH:'Correct', accuracy:'Accuracy', total:'total', streak:'streak', best:'best',
    activity:'Activity', dayStreak:'day streak', less:'Less', more:'More', noActivity:'No activity yet — practice to fill the grid.',
    today:'Today', last7:'Last 7 days', last30:'Last 30 days', allTime:'All time', attempted:'Words attempted',
    wordsTyped:'Words typed', day:'Day', week:'Week', month:'Month', perHour:'per hour', perDay:'per day',
    wordDetails:'Per-word details', noData:'No data for this period yet.',
    clearStats:'clear stats', login:'Login', register:'Register', logout:'Logout → guest', username:'username', password:'password',
    empty:'empty', secondaryNote:'Used for borders & accents',
     packs:'Word packs', usePack:'Use pack', using:'Using', wordsLabel:'words', difficulty:'Difficulty', packsEmpty:'No packs found — is the backend running?', packsLoadFail:'Could not load packs.', loadingPacks:'Loading packs…', loadingPack:'Loading…',
     showHint:'Show hint 💡', hintUsedNote:'Hint used — this word is not scored', youWrote:'You wrote', remember:'Remember', practiceFocus:'Practice focus', reviewSoon:'This word will return soon.', mode:'Mode', seqMode:'In order', randMode:'Random', weakMode:'Weakest first', weakLocked:'Spell over half the pack to unlock weakest mode',
     byLang:'Language', byDiff:'Difficulty', avgAcc:'avg', otherLang:'Other',      easyBand:'Starter ★1–2', medBand:'Intermediate ★3–4', hardBand:'Expert ★5', unsorted:'Unsorted',
     level:'Level', xp:'XP', toNext:'to next', leaderboard:'Leaderboard', topLevels:'Top levels', noScores:'No scores yet — be the first!', guestBoardNote:'Guest XP is local only — login to join the board.',
     testTitle:'Self test', testIntro:'Choose a language and difficulty. Each test has 10 random words, mostly from that level.', startTest:'Start test', starter:'Starter', intermediate:'Intermediate', expert:'Expert', testProgress:'Progress', finish:'Finish', testComplete:'Test complete', right:'right', wrongLabel:'wrong', pastResults:'Past test results', noTestResults:'No tests completed yet.', testAgain:'Test again',
     dailyLesson:'Daily lesson', weakSpots:'Practice my weak spots', due:'Reviews due', learning:'Learning', retained:'Retained after a delay', startDaily:'Start daily lesson', continueReview:'Continue → review later', lessonComplete:'Lesson complete', leaveLesson:'End lesson', manual:'Practice saved words', nextReview:'Next review', independent:'Independent first attempts', assisted:'Assisted study', mistakes:'Practice my mistakes', saved:'Progress saved', unsaved:'Saved on this device · sync pending', saving:'Saving…', retrySave:'Retry sync', importGuest:'Import guest words, answers and tests when registering', importNote:'Matching language + spelling is merged; answer IDs prevent duplicates. Guest data stays on this device.', confirmWord:'Confirm this spelling (name or unusual word)', customLanguage:'Word language', recentWords:'Words to review', patternTitle:'Supported spelling patterns', noPatterns:'More independent answers are needed to identify a recurring pattern.', sample:'mistakes / opportunities', cover:'Cover and recall', studyNote:'Visible spelling is study, not independent recall.', recallNote:'Recall from memory. Correction retries do not count toward mastery.', contentGap:'No related words in this pack yet; reviewing your original words.', lessonNote:'Up to 10 questions · about five minutes · no account needed', recallSummary:'Independent successes', studySummary:'Study answers', answered:'Questions completed', reviewNeeded:'Need another review', errorMissing:'Missing', errorExtra:'Extra', errorSubstituted:'Changed', errorTransposed:'Reversed', patternNote:'Observed spelling differences, not an assumed cause. Use a meaning cue if the words sound alike.',
    },
  es: {
    practice:'Práctica', selfTest:'Prueba', statistics:'Estadísticas', settings:'Ajustes',
    listen:'Escuchar', hint:'Haz clic en escuchar y escribe lo que oyes',
    typeph:'escribe...', check:'Comprobar', next:'Siguiente →', retry:'Reintentar',
    correct:'¡Bien! 🎉', was:'Era', reveal:'Ortografía correcta:', hearAgain:'escuchar de nuevo',
    repeatMode:'Repetir', spellThis:'Escribe esta palabra:', pasteDisabled:'El pegado está deshabilitado en este modo',
    manage:'gestionar', hide:'ocultar', wordList:'lista de palabras', addph:'añadir palabra...', add:'Añadir',
    noWords:'Aún no hay palabras.', savedLocal:'Guardado local (invitado).',
    savedServer:'Guardado en el servidor.',
    guestNote:'Modo invitado — funciona sin conexión.', synced:'Sincronizado como',
    wordsAndStats:'palabras y estadísticas en el servidor.', offline:'Invitado (sin conexión) · ', noTracking:'Sin rastreo · Voz del navegador',
    theme:'Tema', preset:'Preajuste', custom:'Personalizado', background:'Fondo', primary:'Color primario', secondary:'Color secundario', textColor:'Color de texto', font:'Fuente', resetTheme:'Restablecer tema',
    lang:'Idioma', appLangNote:'Idioma de la app (no de la lista)',     defSettings:'Valores por defecto', resetAll:'Restablecer todo',
    statsTitle:'Estadísticas por palabra', word:'Palabra', seen:'Veces', correctH:'Correctas', accuracy:'Precisión', total:'total', streak:'racha', best:'mejor',
    activity:'Actividad', dayStreak:'días seguidos', less:'Menos', more:'Más', noActivity:'Sin actividad — practica para llenar el calendario.',
    today:'Hoy', last7:'Últimos 7 días', last30:'Últimos 30 días', allTime:'Todo', attempted:'Intentos totales',
    wordsTyped:'Palabras escritas', day:'Día', week:'Semana', month:'Mes', perHour:'por hora', perDay:'por día',
    wordDetails:'Detalle por palabra', noData:'Sin datos en este periodo.',
    clearStats:'borrar estadísticas', login:'Entrar', register:'Registrar', logout:'Salir → invitado', username:'usuario', password:'contraseña',
    empty:'vacío', secondaryNote:'Usado para bordes y acentos',
     packs:'Paquetes', usePack:'Usar', using:'Usando', wordsLabel:'palabras', difficulty:'Dificultad', packsEmpty:'Sin paquetes — ¿backend activo?', packsLoadFail:'No se pudieron cargar.', loadingPacks:'Cargando…', loadingPack:'Cargando…',
     showHint:'Ver pista 💡', hintUsedNote:'Pista usada — esta palabra no cuenta', youWrote:'Escribiste', remember:'Recuerda', practiceFocus:'Practica', reviewSoon:'Esta palabra volverá pronto.', mode:'Modo', seqMode:'En orden', randMode:'Aleatorio', weakMode:'Más difíciles', weakLocked:'Deletrea más de la mitad para desbloquear',
     byLang:'Idioma', byDiff:'Dificultad', avgAcc:'prom', otherLang:'Otras',      easyBand:'Inicial ★1–2', medBand:'Intermedio ★3–4', hardBand:'Experto ★5', unsorted:'Sin clasificar',
     level:'Nivel', xp:'XP', toNext:'al siguiente', leaderboard:'Clasificación', topLevels:'Mejores niveles', noScores:'Sin puntuaciones — ¡sé el primero!', guestBoardNote:'Tu XP de invitado es solo local — entra para unirte.',
     testTitle:'Prueba personal', testIntro:'Elige un idioma y una dificultad. Cada prueba tiene 10 palabras al azar, principalmente de ese nivel.', startTest:'Empezar prueba', starter:'Inicial', intermediate:'Intermedio', expert:'Experto', testProgress:'Progreso', finish:'Terminar', testComplete:'Prueba completada', right:'correctas', wrongLabel:'incorrectas', pastResults:'Resultados anteriores', noTestResults:'Aún no hay pruebas completadas.', testAgain:'Otra prueba',
     dailyLesson:'Lección diaria', weakSpots:'Practicar mis dificultades', due:'Repasos pendientes', learning:'En aprendizaje', retained:'Recordadas tras un plazo', startDaily:'Empezar lección diaria', continueReview:'Continuar → repasar después', lessonComplete:'Lección completada', leaveLesson:'Terminar lección', manual:'Practicar palabras guardadas', nextReview:'Próximo repaso', independent:'Primeros intentos sin ayuda', assisted:'Estudio con ayuda', mistakes:'Practicar mis errores', saved:'Progreso guardado', unsaved:'Guardado en este dispositivo · sincronización pendiente', saving:'Guardando…', retrySave:'Reintentar sincronización', importGuest:'Importar palabras, respuestas y pruebas al registrarse', importNote:'Se combinan idioma y palabra; los identificadores evitan duplicados. Los datos de invitado permanecen aquí.', confirmWord:'Confirmar esta ortografía (nombre o palabra inusual)', customLanguage:'Idioma de la palabra', recentWords:'Palabras para repasar', patternTitle:'Patrones con evidencia', noPatterns:'Se necesitan más respuestas sin ayuda para identificar un patrón recurrente.', sample:'errores / oportunidades', cover:'Ocultar y recordar', studyNote:'La palabra visible es estudio, no recuerdo independiente.', recallNote:'Recuerda de memoria. Los reintentos no cuentan para el dominio.', contentGap:'No hay palabras relacionadas en este paquete; repasaremos las originales.', lessonNote:'Hasta 10 preguntas · unos cinco minutos · sin cuenta', recallSummary:'Aciertos sin ayuda', studySummary:'Respuestas de estudio', answered:'Preguntas completadas', reviewNeeded:'Necesitan otro repaso', errorMissing:'Falta', errorExtra:'Sobra', errorSubstituted:'Cambio', errorTransposed:'Inversión', patternNote:'Diferencias observadas, sin suponer su causa. Usa el significado si las palabras suenan igual.',
    }
} as const
type Locale = keyof typeof dict
const locale = ref<Locale>((localStorage.getItem(LS_LOCALE) as Locale) || 'en')
const t = (k: keyof typeof dict.en) => (dict[locale.value] as any)[k] ?? (dict.en as any)[k]
watch(locale, v => localStorage.setItem(LS_LOCALE, v))

// --- theme (Apple HIG base + presets + custom) ---
type Theme = { primary:string, secondary:string, text:string, bg:string, font:string }
const APPLE_FONT = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', Inter, system-ui, sans-serif"
const defaultTheme: Theme = { primary:'#0071e3', secondary:'#e5e5ea', text:'#1d1d1f', bg:'#fbfbfd', font: APPLE_FONT }
const PRESETS: { id:string, label:string, theme:Theme }[] = [
  { id:'light', label:'Light', theme:{ primary:'#0071e3', secondary:'#e5e5ea', text:'#1d1d1f', bg:'#fbfbfd', font: APPLE_FONT } },
  { id:'gray', label:'Gray', theme:{ primary:'#515154', secondary:'#d2d2d7', text:'#1d1d1f', bg:'#f5f5f7', font: APPLE_FONT } },
  { id:'black', label:'Black', theme:{ primary:'#0a84ff', secondary:'#38383a', text:'#f5f5f7', bg:'#1d1d1f', font: APPLE_FONT } },
  { id:'pitch', label:'Pitch Black', theme:{ primary:'#0a84ff', secondary:'#2c2c2e', text:'#ffffff', bg:'#000000', font: APPLE_FONT } },
  { id:'sage', label:'Sage', theme:{ primary:'#4c7c5c', secondary:'#d8e0d4', text:'#1c2520', bg:'#f2f4ef', font: APPLE_FONT } },
  { id:'peach', label:'Peach', theme:{ primary:'#d96c47', secondary:'#ecd9cc', text:'#33231a', bg:'#fdf6f0', font: APPLE_FONT } },
  { id:'lavender', label:'Lavender', theme:{ primary:'#7d7abf', secondary:'#dcd8f0', text:'#26244a', bg:'#f5f3ff', font: APPLE_FONT } },
  { id:'sky', label:'Sky', theme:{ primary:'#0a84ff', secondary:'#cfe3f7', text:'#16283d', bg:'#f0f7ff', font: APPLE_FONT } },
]
function migrateTheme(raw: any): Theme {
  if (!raw) return { ...defaultTheme }
  return { ...defaultTheme, ...raw }
}
const theme = ref<Theme>(migrateTheme(JSON.parse(localStorage.getItem(LS_THEME) || 'null')))
const activePreset = computed(() => PRESETS.find(p =>
  p.theme.primary===theme.value.primary && p.theme.secondary===theme.value.secondary &&
  p.theme.text===theme.value.text && p.theme.bg===theme.value.bg)?.id ?? 'custom')
function pickPreset(id: string){
  const p = PRESETS.find(x=>x.id===id)
  if (p) theme.value = { ...p.theme, font: theme.value.font }
}
const fonts = [APPLE_FONT, 'Georgia, serif', 'ui-monospace, Consolas, monospace', "'Comic Sans MS', cursive", 'Inter, system-ui, sans-serif']
function applyTheme(th: Theme){
  const r = document.documentElement
  r.style.setProperty('--accent', th.primary)
  r.style.setProperty('--border', th.secondary)
  r.style.setProperty('--text-h', th.text)
  r.style.setProperty('--bg', th.bg)
  r.style.setProperty('--sans', th.font)
  r.style.setProperty('--heading', th.font)
  r.style.colorScheme = isDark(th.bg) ? 'dark' : 'light'
}
// ponytail: luminance guess, full contrast calc if theming grows
function isDark(hex: string){
  const m = hex.replace('#','')
  if (m.length < 6) return false
  const r = parseInt(m.slice(0,2),16), g = parseInt(m.slice(2,4),16), b = parseInt(m.slice(4,6),16)
  return (0.2126*r + 0.7152*g + 0.0722*b) < 128
}
watch(theme, v => { localStorage.setItem(LS_THEME, JSON.stringify(v)); applyTheme(v) }, { deep:true })

// --- words & stats ---
const words = ref<string[]>(JSON.parse(localStorage.getItem(LS_WORDS) || 'null') ?? [...DEFAULT_WORDS])
function migrateStats(raw: any): Stats {
  return { total:0, correct:0, streak:0, best:0, dayStreak:0, bestDayStreak:0, activeDays:0, xp:0, level:0, xpPrev:0, xpNext:100, ...raw }
}
const stats = ref<Stats>(migrateStats(JSON.parse(localStorage.getItem(LS_STATS) || 'null')))

// --- XP: guest XP lives in localStorage only (never on the board); auth XP on the server ---
const LS_XP = 'st-xp'
const guestXp = ref(Number(localStorage.getItem(LS_XP) || '0') || 0)
watch(guestXp, v => localStorage.setItem(LS_XP, String(v)))
const currentXp = computed(() => mode.value === 'auth' ? (stats.value.xp ?? 0) : guestXp.value)
const levelInfo = computed(() => xpProgress(currentXp.value))
const xpPct = computed(() => {
  const { prev, next } = levelInfo.value
  return next > prev ? Math.min(100, Math.round((currentXp.value - prev) / (next - prev) * 100)) : 100
})

// --- leaderboard: top XP only, level derived client-side, hover shows XP ---
const board = ref<LeaderEntry[]>([])
const boardLoading = ref(false)
async function refreshBoard() {
  boardLoading.value = true
  try { board.value = await api.leaderboard() }
  catch { /* offline backend -> empty board */ }
  finally { boardLoading.value = false }
}

// per-day activity for guests (auth mode lives in backend) — ponytail: plain date-keyed map
type DayStat = { total:number, correct:number }
const dayStats = ref<Record<string,DayStat>>(JSON.parse(localStorage.getItem(LS_DAYS) || 'null') ?? {})
function localDay(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
watch(dayStats, v => localStorage.setItem(LS_DAYS, JSON.stringify(v)), { deep:true })
// per-hour totals for guest day view: { 'YYYY-MM-DD': number[24] }
const hourStats = ref<Record<string, number[]>>(JSON.parse(localStorage.getItem(LS_HOURS) || 'null') ?? {})
watch(hourStats, v => localStorage.setItem(LS_HOURS, JSON.stringify(v)), { deep:true })
function bumpHour(day: string, hour: number) {
  const arr = hourStats.value[day] ?? (hourStats.value[day] = Array(24).fill(0))
  arr[hour] = (arr[hour] ?? 0) + 1
}
type WStat = { seen:number, correct:number }
const wstats = ref<Record<string,WStat>>(JSON.parse(localStorage.getItem(LS_WSTATS) || 'null') ?? {})
function ensureWStats(list:string[]){
  for(const w of list) if(!wstats.value[w]) wstats.value[w] = { seen:0, correct:0 }
}
ensureWStats(words.value)

const backendWords = ref<{id:number,word:string,locale:string,timesSeen:number,timesCorrect:number}[]>([])
const mode = ref<'guest'|'auth'>(isLoggedIn() ? 'auth' : 'guest')
const authUser = ref<string>(localStorage.getItem('st-user')||'')
const authForm = ref({ username: '', password: '', error: '' })
const authLoading = ref(false)
const view = ref<'practice'|'test'|'stats'|'settings'>('practice')

const guestLanguages = ref<Record<string,string>>(JSON.parse(localStorage.getItem('st-word-languages') || '{}'))
const guestExtraWords = ref<LearningWord[]>(JSON.parse(localStorage.getItem('st-extra-words') || '[]'))
watch(guestLanguages,v=>localStorage.setItem('st-word-languages',JSON.stringify(v)),{deep:true})
watch(guestExtraWords,v=>localStorage.setItem('st-extra-words',JSON.stringify(v)),{deep:true})
const savedWords = computed<LearningWord[]>(() => mode.value==='auth' ? backendWords.value : [...words.value.map(word=>({word,locale:guestLanguages.value[word]??'en'})),...guestExtraWords.value])
const activeWords = ref<LearningWord[]|null>(JSON.parse(localStorage.getItem('st-active-words') || 'null'))
type Lesson = {kind:'daily'|'weak';items:(LearningWord & {retry?:boolean})[];position:number;session:string;complete:boolean;focus:string}
const lesson=ref<Lesson|null>(null)
watch(activeWords,v=>localStorage.setItem('st-active-words',JSON.stringify(v)),{deep:true})
const practiceWords = computed(() => lesson.value ? [lesson.value.items[lesson.value.position] ?? lesson.value.items.at(-1)!] : activeWords.value ?? savedWords.value)
const displayWords = computed(() => practiceWords.value.map(w=>w.word))

const idx = ref(Math.floor(Math.random() * displayWords.value.length))
const input = ref('')
const feedback = ref<'idle'|'correct'|'wrong'>('idle')
const newWord = ref('')
const showList = ref(false)

// --- word packs (served by backend, never hardcoded) ---
const packs = ref<PackMeta[]>([])
const packsLoading = ref(false)
const packsError = ref('')
const packApplying = ref('')
const packEntries = ref<Record<string, PackEntry[]>>({})
const activePackId = ref(localStorage.getItem(LS_PACK) || '')
const contentLocale = ref(localStorage.getItem(LS_CONTENT_LOCALE) || 'en')
watch(contentLocale, v => localStorage.setItem(LS_CONTENT_LOCALE, v))
watch(activePackId, v => localStorage.setItem(LS_PACK, v))
// ponytail: Intl names the language, no locale map to maintain
function langName(packLocale: string): string {
  try {
    const n = new Intl.DisplayNames([locale.value, 'en'], { type: 'language' }).of(packLocale)
    if (n) return n[0].toUpperCase() + n.slice(1)
  } catch {}
  return packLocale
}
function diffLabel(p: PackMeta): string {
  if (p.minDifficulty == null || p.maxDifficulty == null) return '—'
  return p.minDifficulty === p.maxDifficulty ? `★ ${p.minDifficulty}` : `★ ${p.minDifficulty}–${p.maxDifficulty}`
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
watch(view, v => { if (v === 'stats') { refreshActivity(); refreshHourly(); refreshBoard() } })
watch(wstats, v => localStorage.setItem(LS_WSTATS, JSON.stringify(v)), { deep:true })

const current = computed(() => displayWords.value[idx.value] ?? '')
const currentWord = computed<LearningWord>(()=>practiceWords.value[idx.value] ?? {word:'',locale:contentLocale.value})
const accuracy = computed(() => stats.value.total ? Math.round(stats.value.correct / stats.value.total * 100) : 0)

// --- self tests: browser-local history, separate from practice scoring ---
type TestLevel = 'starter'|'intermediate'|'expert'
type TestWord = LearningWord
type TestResult = SavedTest
const testLevel = ref<TestLevel>('starter')
const testLocale = ref(contentLocale.value)
const testWords = ref<TestWord[]>([])
const testIndex = ref(0)
const testInput = ref('')
const testFeedback = ref<'idle'|'correct'|'wrong'>('idle')
const testCorrect = ref(0)
const testAnswers = ref<Attempt[]>([])
const testSession = ref(crypto.randomUUID())
const testLoading = ref(false)
const testResults = ref<TestResult[]>(JSON.parse(localStorage.getItem(LS_TEST_RESULTS) || '[]'))
const testOwner = computed(() => mode.value === 'auth' ? authUser.value : 'guest')
const visibleTestResults = computed(() => store.value.tests)
const testLocales = computed(() => [...new Set(packs.value.map(p => p.locale))].sort())
const testCurrent = computed(() => testWords.value[testIndex.value])
const testFinished = computed(() => testWords.value.length > 0 && testIndex.value >= testWords.value.length)
const testPercent = computed(() => testWords.value.length ? Math.round(testCorrect.value / testWords.value.length * 100) : 0)
watch(testResults, v => localStorage.setItem(LS_TEST_RESULTS, JSON.stringify(v)), { deep:true })

function shuffled<T>(list: T[]): T[] {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

async function startSelfTest() {
  testLoading.value = true
  try {
    const localPacks = packs.value.filter(p => p.locale === testLocale.value && ['starter','intermediate','expert'].includes(p.name))
    for (const p of localPacks) if (!packEntries.value[p.id]) packEntries.value[p.id] = await api.getPack(p.locale, p.name)
    const chosen = localPacks.find(p => p.name === testLevel.value)
    if (!chosen) return
    const primary = packEntries.value[chosen.id] ?? []
    const primaryWords = new Set(primary.map(e => e.word.toLowerCase()))
    const mixed = localPacks.filter(p => p.id !== chosen.id).flatMap(p => packEntries.value[p.id] ?? []).filter(e => !primaryWords.has(e.word.toLowerCase()))
    const entries = [...shuffled(primary).slice(0, 8), ...shuffled(mixed).slice(0, 2)]
    testWords.value = shuffled(entries)
    testAnswers.value=[]; testSession.value=crypto.randomUUID()
    testIndex.value = 0; testCorrect.value = 0; testInput.value = ''; testFeedback.value = 'idle'
    if (testCurrent.value) speak(false, testCurrent.value.word, testCurrent.value.locale)
  } finally { testLoading.value = false }
}

function submitTestAnswer() {
  const currentWord = testCurrent.value
  if (!currentWord || !testInput.value.trim()) return
  if (testFeedback.value === 'idle') {
    const ok = isCorrect(currentWord,testInput.value)
    const a=recordAnswer(currentWord,testInput.value,'test','none',testSession.value)
    testAnswers.value.push(a)
    if (ok) testCorrect.value++
    testFeedback.value = ok ? 'correct' : 'wrong'
    return
  }
  testIndex.value++
  if (testFinished.value) {
    const result:SavedTest={id:crypto.randomUUID(),owner:testOwner.value, date:new Date().toISOString(), level:testLevel.value, locale:testLocale.value, correct:testCorrect.value, total:testWords.value.length,answers:[...testAnswers.value]}
    store.value.tests.unshift(result); store.value.pendingTests.push(result.id); persistLearning(); syncLearning()
  } else {
    testInput.value = ''; testFeedback.value = 'idle'
    speak(false, testCurrent.value.word, testCurrent.value.locale)
  }
}

function resetSelfTest() {
  testWords.value = []; testIndex.value = 0; testInput.value = ''; testFeedback.value = 'idle'; testCorrect.value = 0
}

function getWStat(word:string,lang=contentLocale.value): WStat {
  if(mode.value==='auth'){
    const b = backendWords.value.find(x=>x.word===word && x.locale===lang)
    if(b) return { seen:b.timesSeen, correct:b.timesCorrect }
    const local=attempts.value.filter(a=>a.locale===lang && normalize(a.word)===normalize(word) && eligible(a) && a.exercise!=='test')
    return {seen:local.length,correct:local.filter(a=>a.correct).length}
  }
  return wstats.value[`${lang}:${normalize(word)}`] ?? (lang==='en' ? wstats.value[word] : null) ?? { seen:0, correct:0 }
}
// --- word meta (locale/difficulty/teaching cues per word, from packs) ---
const wordMeta = ref<Record<string, { locale: string, difficulty: number | null, hint?: string, tags?: string[] }>>({})
const hintShown = ref(false)
const retrying = ref(false)
const covered = ref(false)
const submitted = ref('')
const currentMeta = computed(() => wordMeta.value[wordKey(currentWord.value)])
const hintText = computed(() => currentMeta.value?.hint ?? '')
const practiceFocus = computed(() => currentMeta.value?.tags?.map(tag => tag.replaceAll('-', ' ').trim()).join(', ') ?? '')

// --- drill mode: sequential (all words) | random | weakest (unlocks past half) ---
const LS_DRILL = 'st-drill'
const drill = ref<'seq'|'rand'|'weak'|'repeat'>((localStorage.getItem(LS_DRILL) as any) || 'rand')
watch(drill, v => {localStorage.setItem(LS_DRILL, v); covered.value=false; if(feedback.value==='idle'){input.value=''} })
const seenCount = computed(() => displayWords.value.filter(w => getWStat(w).seen > 0).length)
const weakUnlocked = computed(() => displayWords.value.length > 0 && seenCount.value > displayWords.value.length / 2)
const reviewQueue = ref<{ word:string, locale:string, wait:number }[]>([])

function scheduleReview(word: string) {
  const queued = reviewQueue.value.find(item => item.word === word && item.locale===currentWord.value.locale)
  if (queued) queued.wait = 2
  else reviewQueue.value.push({ word, locale:currentWord.value.locale, wait:2 })
}

function weightedPick(){
  const list = displayWords.value
  if(!list.length) return 0
  // weighted by difficulty: misses + low accuracy get higher weight (ponytail: simple linear weight)
  const weights = list.map(w=>{
    const r=reviewRows.value.find(r=>r.key===wordKey(practiceWords.value[list.indexOf(w)]))
    return 1 + (r?.rate??0)*4 + Number(r && Date.parse(r.due)<=Date.now())*3
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
  input.value = ''
  feedback.value = 'idle'
  hintShown.value = false
}

// The guest ledger is independent of account caches; logging out always restores guest progress.
type LearningStore = {attempts:Attempt[];tests:SavedTest[];pending:string[];pendingTests:string[]}
const learningStores = ref<Record<string,LearningStore>>(JSON.parse(localStorage.getItem('st-learning') || '{}'))
const owner = computed(()=>mode.value==='auth'?`account:${authUser.value}`:'guest')
watch(owner,key=>{if(!learningStores.value[key])learningStores.value[key]={attempts:[],tests:[],pending:[],pendingTests:[]}},{immediate:true,flush:'sync'})
const store = computed(()=>learningStores.value[owner.value]!)
const attempts = computed(()=>store.value.attempts)
const reviewRows = computed(()=>reviews(attempts.value))
const rankedReviews = computed(()=>rankWords(reviewRows.value))
const supportedPatterns = computed(()=>patterns(attempts.value).filter(p=>p.locale===contentLocale.value))
const dueCount = computed(()=>reviewRows.value.filter(r=>r.locale===contentLocale.value && Date.parse(r.due)<=Date.now()).length)
const retainedCount = computed(()=>reviewRows.value.filter(r=>r.retained).length)
const independentAnswers = computed(()=>attempts.value.filter(eligible))
const recentIndependent = computed(()=>independentAnswers.value.slice(-100))
const recentAccuracy = computed(()=>recentIndependent.value.length?Math.round(recentIndependent.value.filter(a=>a.correct).length/recentIndependent.value.length*100):null)
const importGuest = ref(true)
const confirmCustom = ref(false)
const customLocale = ref('en')
const saveState = ref<'saved'|'pending'|'saving'|'failed'>('saved')
const sessionId = ref(crypto.randomUUID())
const pendingCount = computed(()=>store.value.pending.length+store.value.pendingTests.length)
function persistLearning() {
  try {localStorage.setItem('st-learning',JSON.stringify(learningStores.value)); saveState.value=mode.value==='auth' && pendingCount.value?'pending':'saved'}
  catch {saveState.value='failed'}
}
let syncing = false
async function syncLearning() {
  if(mode.value!=='auth' || !authUser.value || syncing) return
  const key=owner.value, user=authUser.value, data=store.value
  syncing=true;saveState.value='saving'
  let success=false
  try {
    // Also migrate existing browser-local self-test summaries, without inventing answer text.
    for(const old of testResults.value.filter(r=>r.owner===user)) {
      if(!old.id) old.id=crypto.randomUUID()
      if(!data.tests.some(r=>r.id===old.id)) {data.tests.push(old);data.pendingTests.push(old.id)}
    }
    localStorage.setItem(LS_TEST_RESULTS,JSON.stringify(testResults.value))
    while(data.pending.length || data.pendingTests.length) {
      if(owner.value!==key) return
      const ids=data.pending.slice(0,500)
      const tests=data.pending.length>500?[]:data.pendingTests.slice(0,100)
      await api.syncLearning(data.attempts.filter(a=>ids.includes(a.id)),data.tests.filter(r=>tests.includes(r.id)))
      data.pending=data.pending.filter(id=>!ids.includes(id));data.pendingTests=data.pendingTests.filter(id=>!tests.includes(id))
      persistLearning()
    }
    if(owner.value!==key) return
    const remote=await api.learning()
    data.attempts=mergeAttempts(data.attempts,remote.attempts)
    data.tests=[...new Map([...data.tests,...remote.tests].map(r=>[r.id,r])).values()].sort((a,b)=>b.date.localeCompare(a.date))
    persistLearning()
    if(owner.value===key) {stats.value=await api.stats();backendWords.value=await api.getWords();await refreshActivity()}
    success=true
  } catch {if(owner.value===key) saveState.value='pending'}
  finally {syncing=false;if(success && pendingCount.value || owner.value!==key && mode.value==='auth') syncLearning()}
}
window.addEventListener('online',()=>syncLearning())
function recordAnswer(w:LearningWord,answer:string,exercise:Attempt['exercise'],assistance:Attempt['assistance'],session:string=sessionId.value):Attempt {
  const a:Attempt={id:crypto.randomUUID(),word:w.word,locale:w.locale,submitted:answer.normalize('NFC').trim(),date:new Date().toISOString(),day:localDay(),hour:new Date().getHours(),session,exercise,assistance,correct:isCorrect(w,answer),standard:'default'}
  const rewarded=attempts.value.some(x=>wordKey(x)===wordKey(a) && x.day===a.day && x.correct && eligible(x) && x.exercise!=='test')
  store.value.attempts.push(a)
  if(mode.value==='auth') store.value.pending.push(a.id)
  else {
    const d=dayStats.value[a.day]??(dayStats.value[a.day]={total:0,correct:0});d.total++;if(a.correct)d.correct++
    bumpHour(a.day,a.hour)
    if(eligible(a) && exercise!=='test') {
      stats.value.total++
      if(a.correct) {stats.value.correct++;stats.value.streak++;stats.value.best=Math.max(stats.value.best,stats.value.streak);if(!rewarded)guestXp.value+=XP_PER_CORRECT}
      else stats.value.streak=0
      const s=wstats.value[wordKey(a)]??(wstats.value[wordKey(a)]={seen:0,correct:0});s.seen++;if(a.correct)s.correct++
    }
  }
  persistLearning();syncLearning()
  return a
}
const lessonAnswers=computed(()=>lesson.value?attempts.value.filter(a=>a.session===lesson.value!.session):[])
const lessonFirsts=computed(()=>lessonAnswers.value.filter(eligible))
const lessonTransfer=computed(()=>lessonFirsts.value.filter(a=>a.correct && !attempts.value.some(old=>old.session!==a.session && wordKey(old)===wordKey(a))))
const lessonDelayed=computed(()=>lessonFirsts.value.filter(a=>a.correct && reviewRows.value.some(r=>r.key===wordKey(a) && r.stage>=2 && r.last===a.date)))
const lessonNeedsReview=computed(()=>reviewRows.value.filter(r=>lessonAnswers.value.some(a=>wordKey(a)===r.key) && !r.recent.at(-1)?.correct))
const nextReview=computed(()=>reviewRows.value.filter(r=>!lesson.value || lessonAnswers.value.some(a=>wordKey(a)===r.key)).map(r=>r.due).sort()[0])
function manualPractice() {
  sessionId.value=crypto.randomUUID()
  lesson.value=null;activeWords.value=null;activePackId.value='';reviewQueue.value=[];idx.value=0;input.value='';feedback.value='idle';hintShown.value=false;retrying.value=false;covered.value=false
}
function startLesson(weak=false,list?:LearningWord[]) {
  const selected=activeWords.value??savedWords.value.filter(w=>w.locale===contentLocale.value)
  const ceiling=activeWords.value?Math.max(...activeWords.value.map(w=>w.difficulty??3)):3
  const bundled=Object.values(packEntries.value).flat().filter(w=>w.locale===contentLocale.value && (w.difficulty??3)<=ceiling)
  const pool=[...new Map([...selected,...bundled].map(w=>[wordKey(w),w])).values()]
  const items=shuffled(list??buildLesson(attempts.value,pool,contentLocale.value,weak))
  if(!items.length) return
  const p=supportedPatterns.value[0]
  const focus=p?(locale.value==='es'?`Has escrito «${p.typed || '∅'}» en lugar de «${p.expected}» (${p.position}). Repasaremos esa diferencia.`:`You have sometimes typed “${p.typed || '∅'}” instead of “${p.expected}” (${p.position}). Let's review this spelling difference.`)+` ${p.failures}/${p.opportunities}.`:''
  lesson.value={kind:weak?'weak':'daily',items,position:0,session:crypto.randomUUID(),complete:false,focus}
  view.value='practice';idx.value=0;input.value='';feedback.value='idle';hintShown.value=false;retrying.value=false;covered.value=false;reviewQueue.value=[];speak()
}
function advanceLesson() {
  const l=lesson.value
  if(!l) return
  l.position++
  if(l.position>=l.items.length) {l.complete=true;return}
  idx.value=0;input.value='';feedback.value='idle';hintShown.value=false;covered.value=false;retrying.value=!!l.items[l.position].retry
}
function retryWord() {retrying.value=true;covered.value=true;input.value='';feedback.value='idle';hintShown.value=false;speak()}
function continueWord() {pickNext();if(!lesson.value?.complete)speak()}
function practiceTestMistakes(result:SavedTest) {
  const missed=result.answers?.filter(a=>!a.correct)??[]
  contentLocale.value=result.locale
  startLesson(true,[...new Map(missed.map(a=>[wordKey(a),{word:a.word,locale:a.locale}])).values()])
}
const correctionSpans=computed(()=>align(current.value,submitted.value).spans)
function browserSpeak(text: string,wordLocale:string) {
  try {
    speechSynthesis.cancel()
    speechSynthesis.resume() // autoplay policy can leave it paused -> silence
    const u = new SpeechSynthesisUtterance(text)
    u.lang = wordLocale
    const v = speechSynthesis.getVoices().find(v => v.lang.startsWith(wordLocale))
    if (v) u.voice = v
    u.rate = 0.8
    speechSynthesis.speak(u)
    speechSynthesis.resume()
  } catch {}
}

// ponytail: static per-word file, browser caches it; missing file -> browser voice
let audioEl: HTMLAudioElement | null = null
const audioLoading = ref(false)
async function speak(autoplay = false, word = current.value, wordLocale = currentWord.value.locale) {
  if (!word) return
  const text = word
  audioLoading.value = true
  // ponytail: onerror + play() rejection both fire for a missing file; fall back once
  // (second browserSpeak cancels the first -> clipped silence). Autoplay has no
  // user gesture, so skip the voice fallback there instead of wedging speechSynthesis paused.
  let fellBack = false
  const fallback = () => { if (!fellBack) { fellBack = true; if (!autoplay) browserSpeak(text,wordLocale) } }
  try {
    audioEl?.pause()
    audioEl = new Audio(api.audioUrl(wordLocale, text))
    audioEl.onerror = fallback
    await audioEl.play()
  } catch {
    fallback()
  } finally {
    audioLoading.value = false
  }
}

async function logout() {
  try{ await api.logout() }catch{}
  api.setToken(''); authUser.value=''; localStorage.removeItem('st-user'); mode.value='guest'; authForm.value={username:'',password:'',error:''}
  words.value = JSON.parse(localStorage.getItem(LS_WORDS) || 'null') ?? [...DEFAULT_WORDS]
  stats.value = migrateStats(JSON.parse(localStorage.getItem(LS_STATS) || 'null'))
  guestXp.value = Number(localStorage.getItem(LS_XP) || '0') || 0
  wstats.value = JSON.parse(localStorage.getItem(LS_WSTATS) || 'null') ?? {}
  hourStats.value = JSON.parse(localStorage.getItem(LS_HOURS) || 'null') ?? {}
  ensureWStats(words.value)
  idx.value=0
  lesson.value=null; reviewQueue.value=[]; retrying.value=false; covered.value=false; feedback.value='idle';input.value='';resetSelfTest()
}
async function refreshAuthData() {
  if (mode.value !== 'auth') return
  try {
    await syncLearning()
    const [w, s] = await Promise.all([api.getWords(), api.stats()])
    backendWords.value = w
    stats.value = s
    await refreshActivity()
    idx.value = 0
    feedback.value='idle'
    input.value=''
    localStorage.setItem('st-user', authUser.value)
  } catch(e:any){
    if(e.message.includes('unauthorized')) logout()
  }
}

async function check() {
  if (feedback.value!=='idle' || !input.value.trim() || !current.value) return
  submitted.value=input.value.trim()
  const repeated=attempts.value.some(a=>a.session===(lesson.value?.session??sessionId.value) && wordKey(a)===wordKey(currentWord.value))
  const visible=showList.value && savedWords.value.some(w=>wordKey(w)===wordKey(currentWord.value))
  const assistance=hintShown.value?'hint':retrying.value || repeated?'retry':visible || drill.value==='repeat' && !covered.value && !lesson.value?'copy':'none'
  const a=recordAnswer(currentWord.value,input.value,lesson.value?.kind??'practice',assistance,lesson.value?.session??sessionId.value)
  feedback.value=a.correct?'correct':'wrong'
  if(!a.correct) {
    if(lesson.value) {
      const l=lesson.value, place=l.position+3
      if(place<10 && place<=l.items.length && !l.items.slice(l.position+1).some(w=>wordKey(w)===wordKey(a))) {
        const retry={word:a.word,locale:a.locale,retry:true}
        if(l.items.length<10) l.items.splice(place,0,retry)
        else l.items[place]=retry
      }
    } else scheduleReview(current.value)
  }
}

async function onSubmit() {
  if(feedback.value==='wrong') retryWord()
  else if(feedback.value==='correct') continueWord()
  else check()
}

async function addWord() {
  const w = normalize(newWord.value)
  if (!w) return
  if(w.length>50 || !/^[\p{L}\p{M}’'\- ]+$/u.test(w)) {authForm.value.error='Use letters, spaces, apostrophes or hyphens (50 characters max).';return}
  if(!wordMeta.value[wordKey({word:w,locale:customLocale.value})] && !confirmCustom.value) {authForm.value.error=t('confirmWord');return}
  if (mode.value==='auth') {
    try{ await api.addWord(w,customLocale.value,confirmCustom.value); backendWords.value = await api.getWords(); newWord.value=''; if(backendWords.value.length===1) idx.value=0 }
    catch(e:any){ authForm.value.error=e.message }
  } else {
    if (savedWords.value.some(x=>wordKey(x)===wordKey({word:w,locale:customLocale.value}))) return
    guestExtraWords.value.push({word:w,locale:customLocale.value});newWord.value=''
  }
  confirmCustom.value=false;authForm.value.error=''
}

async function removeWord(w: LearningWord) {
  if (mode.value==='auth') {
    const found = backendWords.value.find(x=>wordKey(x)===wordKey(w))
    if(found) { await api.deleteWord(found.id); backendWords.value = backendWords.value.filter(x=>x.id!==found.id) }
  } else {
    words.value = words.value.filter(x => x !== w.word || (guestLanguages.value[x]??'en')!==w.locale)
    guestExtraWords.value=guestExtraWords.value.filter(x=>wordKey(x)!==wordKey(w))
  }
  if (idx.value >= displayWords.value.length) idx.value = 0
  feedback.value = 'idle'; input.value = ''
}

async function resetStats() {
  if (mode.value==='auth') { await api.resetStats(); stats.value = await api.stats(); await refreshActivity(); await refreshBoard(); }
  else { stats.value = migrateStats({}); guestXp.value = 0; dayStats.value = {}; hourStats.value = {}; for(const k of Object.keys(wstats.value)) wstats.value[k]={seen:0,correct:0} }
  learningStores.value[owner.value]={attempts:[],tests:[],pending:[],pendingTests:[]};testResults.value=testResults.value.filter(r=>r.owner!==testOwner.value);persistLearning();reviewQueue.value=[];lesson.value=null
}
function resetTheme(){ theme.value={...defaultTheme}; }
function resetAll(){ resetTheme(); locale.value='en'; resetStats(); }

async function login() {
  authForm.value.error=''; authLoading.value=true
  try{
    const r = await api.login(authForm.value.username, authForm.value.password)
    api.setToken(r.token); authUser.value=r.username; mode.value='auth';resetSelfTest();lesson.value=null;sessionId.value=crypto.randomUUID(); await refreshAuthData(); await refreshBoard()
  } catch(e:any){ authForm.value.error=e.message } finally{ authLoading.value=false }
}
async function register() {
  authForm.value.error=''; authLoading.value=true
  try{
    const guest=learningStores.value.guest, guestWords=[...savedWords.value]
    const r = await api.register(authForm.value.username, authForm.value.password)
    api.setToken(r.token); authUser.value=r.username; mode.value='auth';resetSelfTest();lesson.value=null;sessionId.value=crypto.randomUUID()
    if(importGuest.value) {
      if(guest) {store.value.attempts=mergeAttempts(store.value.attempts,guest.attempts);store.value.pending=[...new Set([...store.value.pending,...guest.attempts.map(a=>a.id)])];const tests=guest.tests.map(t=>({...t,owner:r.username}));store.value.tests=[...store.value.tests,...tests];store.value.pendingTests.push(...tests.map(t=>t.id));persistLearning()}
      for(const w of guestWords) try{await api.addWord(w.word,w.locale,true)}catch(e:any){if(!e.message.includes('already exists'))authForm.value.error=e.message}
    } else for(const word of DEFAULT_WORDS) await api.addWord(word)
    await refreshAuthData(); await refreshBoard()
  } catch(e:any){ authForm.value.error=e.message } finally{ authLoading.value=false }
}

type Row = { word: string, seen: number, correct: number, acc: number, locale: string, difficulty: number | null }
const perWordRows = computed<Row[]>(()=>{
  const list = [...new Map([...savedWords.value,...reviewRows.value].map(w=>[wordKey(w),w])).values()]
  return list.map(w=>{
    const s=getWStat(w.word,w.locale); const acc=s.seen? Math.round(s.correct/s.seen*100):0
    const m = wordMeta.value[wordKey(w)]
    return { word:w.word, seen:s.seen, correct:s.correct, acc, locale: w.locale, difficulty: m?.difficulty ?? null }
  }).sort((a,b)=> a.acc-b.acc || b.seen-a.seen)
})
function sectionAvg(rows: Row[]): number | null {
  const t = rows.reduce((a,r)=>a+r.seen,0)
  return t ? Math.round(rows.reduce((a,r)=>a+r.correct,0)/t*100) : null
}
// one tree: language → difficulty band → words (single collapsible statistic)
function bandOf(d: number | null): 'easy'|'med'|'hard'|'na' {
  if (d == null) return 'na'
  return d <= 2 ? 'easy' : d <= 4 ? 'med' : 'hard'
}
const BAND_ORDER = ['easy','med','hard','na'] as const
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
          const broows = rows.filter(r => bandOf(r.difficulty) === b)
          return { key: b, title: bandTitle[b], avg: sectionAvg(broows), rows: broows }
        })
    }))
})

// --- activity (server for auth, localStorage for guest) ---
const HEAT_DAYS = 182
const serverDays = ref<DayActivity[]>([])
async function refreshActivity() {
  if (mode.value !== 'auth') return
  try {
    const a = await api.activity(HEAT_DAYS, localDay())
    serverDays.value = a.days
  } catch {}
}
// guest day streak from local map — same consecutive-day rule as backend
function streakOf(active: Set<string>): { cur:number, best:number } {
  const today = new Date()
  const key = (d: Date) => localDay(d)
  let cur = 0
  const c = new Date(today)
  if (!active.has(key(c))) c.setDate(c.getDate() - 1)
  while (active.has(key(c))) { cur++; c.setDate(c.getDate() - 1) }
  let best = 0, run = 0, prev = 0
  for (const k of [...active].sort()) {
    const time = new Date(k + 'T00:00:00').getTime()
    run = prev && time - prev === 864e5 ? run + 1 : 1
    best = Math.max(best, run)
    prev = time
  }
  return { cur, best }
}
const guestStreak = computed(() => streakOf(new Set(Object.keys(dayStats.value).filter(k => dayStats.value[k].total > 0))))
const dayStreak = computed(() => mode.value === 'auth' ? stats.value.dayStreak : guestStreak.value.cur)
const bestDayStreak = computed(() => mode.value === 'auth' ? stats.value.bestDayStreak : guestStreak.value.best)
const heatDays = computed<DayActivity[]>(() => {
  if (mode.value === 'auth' && serverDays.value.length) return serverDays.value
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
// --- range accuracies: today / last 7 / last 30 / all time (from the same daily series) ---
function sumRange(days: DayActivity[], n: number): { total:number, correct:number } {
  const slice = days.slice(-n)
  return { total: slice.reduce((a, d) => a + d.total, 0), correct: slice.reduce((a, d) => a + d.correct, 0) }
}
function accOf(total: number, correct: number): number | null {
  return total ? Math.round(correct / total * 100) : null
}
function practiceRange(n:number) {
  const start=new Date();start.setDate(start.getDate()-n+1)
  const list=attempts.value.filter(a=>eligible(a) && a.exercise!=='test' && a.day>=localDay(start))
  return accOf(list.length,list.filter(a=>a.correct).length)
}
const accToday = computed(() => practiceRange(1))
const acc7 = computed(() => practiceRange(7))
const acc30 = computed(() => practiceRange(30))
const rangeTotals = computed(() => ({
  today: heatDays.value[heatDays.value.length - 1]?.total ?? 0,
  w7: sumRange(heatDays.value, 7).total,
  m30: sumRange(heatDays.value, 30).total,
}))
const fmtAcc = (a: number | null) => a == null ? '—' : `${a}%`
// --- words-typed bar chart: month (30d) / week (7d) / day (24h) ---
const chartRange = ref<'month'|'week'|'day'>('month')
const serverHourly = ref<number[]>(Array(24).fill(0))
async function refreshHourly() {
  if (mode.value !== 'auth' || chartRange.value !== 'day') return
  try {
    const r = await api.activityHourly(localDay())
    serverHourly.value = r.hourly.map(h => h.total)
  } catch {}
}
watch([chartRange, () => view.value, () => mode.value], refreshHourly)
type Bar = { label: string, value: number, title: string }
const chartBars = computed<Bar[]>(() => {
  if (chartRange.value === 'day') {
    const arr = mode.value === 'auth' ? serverHourly.value : (hourStats.value[localDay()] ?? Array(24).fill(0))
    return arr.map((v, h) => ({ label: String(h), value: v, title: `${h}:00 — ${v} words` }))
  }
  const n = chartRange.value === 'week' ? 7 : 30
  return heatDays.value.slice(-n).map(d => ({ label: d.date.slice(5), value: d.total, title: `${d.date}: ${d.total} words` }))
})
const chartMax = computed(() => Math.max(1, ...chartBars.value.map(b => b.value)))
const chartTotal = computed(() => chartBars.value.reduce((a, b) => a + b.value, 0))

onMounted(async () => {
  applyTheme(theme.value)
  loadPacks()
  refreshBoard()
  for(const old of testResults.value.filter(r=>r.owner===testOwner.value)) {if(!old.id)old.id=crypto.randomUUID();if(!store.value.tests.some(r=>r.id===old.id)){store.value.tests.push(old);if(mode.value==='auth')store.value.pendingTests.push(old.id)}}
  persistLearning()
  try { speechSynthesis.getVoices(); speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices() } catch {} // ponytail: warm async voice list for fallback
  if(mode.value==='auth' && authUser.value) await refreshAuthData()
  if (displayWords.value.length){
    idx.value = 0
    setTimeout(() => speak(true), 600) // no gesture yet: mp3 only, no voice fallback
  }
})
</script>

<template>
  <header class="top">
    <div class="brand">SpellingTeacher <span>beta</span> <span v-if="mode==='auth'" style="background:#22c55e22;color:#16a34a;border-color:#22c55e44">● {{ authUser }}</span><span v-else style="background:#64748b22;color:#64748b">guest</span></div>
    <nav class="nav">
      <button :class="{active: view==='practice'}" @click="view='practice'">{{ t('practice') }}</button>
      <button :class="{active: view==='test'}" @click="view='test'">{{ t('selfTest') }}</button>
      <button :class="{active: view==='stats'}" @click="view='stats'">{{ t('statistics') }}</button>
      <button :class="{active: view==='settings'}" @click="view='settings'">{{ t('settings') }}</button>
    </nav>
    <div class="stats">
      <span :title="`${currentXp} ${t('xp')} (${currentXp - levelInfo.prev}/${levelInfo.next - levelInfo.prev} ${t('toNext')})`">⭐ {{ t('level') }} {{ levelInfo.level }} <em>{{ currentXp }} {{ t('xp') }}</em></span>
      <span class="xpbar" :title="`${currentXp} / ${levelInfo.next} ${t('xp')}`"><span :style="{ width: xpPct + '%' }" /></span>
      <span title="streak">🔥 {{ stats.streak }} <em>{{ t('best') }} {{ stats.best }}</em></span>
      <span :title="t('dayStreak')">📅 {{ dayStreak }} <em>{{ t('best') }} {{ bestDayStreak }}</em></span>
      <span>{{ stats.correct }}/{{ stats.total }} <em>{{ accuracy }}%</em></span>
      <button class="link" @click="resetStats" v-if="stats.total">{{ t('clearStats') }}</button>
    </div>
  </header>

  <div class="authbar" v-if="mode==='guest'">
    <span class="muted">{{ t('guestNote') }}</span>
    <div class="auth-row">
      <input v-model="authForm.username" :placeholder="t('username')" autocomplete="username" class="add-input" style="width:120px" />
      <input v-model="authForm.password" type="password" :placeholder="t('password')" autocomplete="current-password" class="add-input" style="width:120px" @keydown.enter="login" />
      <button @click="login" :disabled="authLoading" class="small">{{ t('login') }}</button>
      <button @click="register" :disabled="authLoading" class="small secondary">{{ t('register') }}</button>
      <label class="import-choice"><input type="checkbox" v-model="importGuest" /> {{ t('importGuest') }}</label>
      <p class="muted">{{ t('importNote') }}</p>
    </div>
    <p v-if="authForm.error" class="err">{{ authForm.error }}</p>
  </div>
  <div class="authbar" v-else>
    <span class="muted">{{ t('synced') }} <strong>{{ authUser }}</strong> — {{ t('wordsAndStats') }}</span>
    <button @click="logout" class="small">{{ t('logout') }}</button>
  </div>

  <div class="save-status" role="status" aria-live="polite">
    {{ saveState==='failed' ? 'Could not save on this device. Keep this page open and free browser storage.' : saveState==='saving' ? t('saving') : mode==='auth' && pendingCount ? t('unsaved') : t('saved') }}
    <button v-if="mode==='auth'" class="link" @click="syncLearning" :disabled="saveState==='saving'">{{ t('retrySave') }}</button>
  </div>

  <!-- PRACTICE -->
  <main id="center" v-if="view==='practice'" style="gap:28px">
    <section class="panel learning-panel">
      <div class="lesson-heading"><div><h2>{{ t('dailyLesson') }}</h2><p class="muted">{{ langName(contentLocale) }} · {{ t('lessonNote') }}</p></div><strong>{{ dueCount }} {{ t('due') }}</strong></div>
      <div class="lesson-actions"><button class="small" @click="startLesson()" :disabled="!displayWords.length || !!lesson && !lesson.complete">{{ t('startDaily') }}</button><button class="small secondary" @click="startLesson(true)" :disabled="!displayWords.length || !!lesson && !lesson.complete">{{ t('weakSpots') }}</button><button class="link" @click="manualPractice">{{ t('manual') }}</button></div>
      <p v-if="lesson && !lesson.complete" class="lesson-progress" role="status">{{ lesson.position+1 }} / {{ lesson.items.length }} <button class="link" @click="manualPractice">{{ t('leaveLesson') }}</button></p>
      <p v-if="lesson?.focus && !lesson.complete" class="muted">{{ t('practiceFocus') }}: {{ lesson.focus }} · {{ t('patternNote') }}</p>
    </section>
    <section v-if="lesson?.complete" class="panel lesson-summary" role="status">
      <h2>{{ t('lessonComplete') }}</h2>
      <p>{{ lesson.items.length }} {{ t('answered') }} · {{ lessonFirsts.filter(a=>a.correct).length }}/{{ lessonFirsts.length }} {{ t('recallSummary') }} · {{ lessonAnswers.filter(a=>!eligible(a)).length }} {{ t('studySummary') }}</p>
      <p>{{ t('reviewNeeded') }}: {{ lessonNeedsReview.map(r=>r.word).join(', ') || '—' }}</p>
      <p>{{ locale==='es' ? 'Recuerdo con retraso' : 'Delayed recall' }}: {{ lessonDelayed.map(a=>a.word).join(', ') || '—' }}</p>
      <p>{{ locale==='es' ? 'Primer recuerdo de palabras nuevas' : 'First recall of new words' }}: {{ lessonTransfer.map(a=>a.word).join(', ') || '—' }}</p>
      <p>{{ t('nextReview') }}: {{ nextReview ? new Date(nextReview).toLocaleString(locale) : '—' }}</p>
      <button class="small" @click="manualPractice">{{ t('manual') }}</button>
    </section>
    <template v-if="!lesson?.complete">
    <div v-if="displayWords.length && !lesson" class="nav" :aria-label="t('mode')">
      <button :class="{active: drill==='seq'}" @click="drill='seq'">{{ t('seqMode') }}</button>
      <button :class="{active: drill==='rand'}" @click="drill='rand'">{{ t('randMode') }}</button>
      <button :class="{active: drill==='weak'}" @click="drill='weak'" :disabled="!weakUnlocked" :title="weakUnlocked ? '' : t('weakLocked')">{{ t('weakMode') }}</button>
      <button :class="{active: drill==='repeat'}" @click="drill='repeat'">{{ t('repeatMode') }}</button>
    </div>
    <p v-if="!weakUnlocked && !lesson" class="muted" style="font-size:13px">{{ t('weakLocked') }} ({{ seenCount }}/{{ displayWords.length }})</p>
    <div v-if="!displayWords.length" class="empty">
      <p>{{ t('noWords') }}</p>
    </div>
    <template v-else>
      <button class="speak" @click="() => speak()" aria-label="Speak word">
        <span class="speak-icon">🔊</span> {{ t('listen') }}
      </button>
      <p class="hint">{{ t('hint') }}</p>
      <button v-if="hintText && !hintShown" class="small secondary" @click="hintShown = true">{{ t('showHint') }}</button>
      <p v-if="hintShown && hintText" style="font-size:15px">💡 {{ hintText }}</p>
      <p v-if="hintShown" class="muted" style="font-size:12px; margin-top:-8px">{{ t('hintUsedNote') }}</p>
      <p v-if="drill==='repeat' && current && !covered && !retrying && !lesson" class="repeat-word">{{ current }}</p>
      <template v-if="drill==='repeat' && !lesson && !covered && !retrying"><p class="muted">{{ t('studyNote') }}</p><button class="small" @click="covered=true; input=''">{{ t('cover') }}</button></template>
      <p v-if="retrying" class="muted">{{ t('recallNote') }}</p>
      <form @submit.prevent="onSubmit" class="form">
        <input
          v-model="input"
          :placeholder="feedback==='idle' ? t('typeph') : feedback==='correct' ? t('correct') : `${t('was')}: ${current}`"
          :class="['spell', feedback]"
          :readonly="feedback!=='idle'" maxlength="200" aria-label="Your spelling"
          autocomplete="off" autocapitalize="off" spellcheck="false"
          @paste="(e) => { if (drill === 'repeat') e.preventDefault() }"
          @keydown.meta.v="(e) => { if (drill === 'repeat') e.preventDefault() }"
          @keydown.ctrl.v="(e) => { if (drill === 'repeat') e.preventDefault() }"
        />
        <button :class="['cta', feedback]" type="submit">
          {{ feedback==='idle' ? t('check') : feedback==='correct' ? t('next') : t('retry') }}
        </button>
      </form>
      <button v-if="feedback==='wrong'" class="small secondary" @click="continueWord">{{ t('continueReview') }}</button>
      <div v-if="feedback==='wrong'" class="reveal correction" role="status">
        <p>{{ t('youWrote') }}: <s>{{ submitted }}</s> · {{ t('reveal') }} <strong>{{ current }}</strong> <button class="link" @click="() => speak()">{{ t('hearAgain') }}</button></p>
        <p class="changed-spans"><span v-for="(span,i) in correctionSpans" :key="i">{{ t(({missing:'errorMissing',extra:'errorExtra',substituted:'errorSubstituted',transposed:'errorTransposed'} as const)[span.kind]) }}: <mark>{{ span.expected || '∅' }}</mark> → <s>{{ span.typed || '∅' }}</s> <small>({{ span.position }})</small></span></p>
        <p v-if="hintText"><strong>{{ t('remember') }}:</strong> {{ hintText }}</p>
        <p v-if="practiceFocus" class="muted"><strong>{{ t('practiceFocus') }}:</strong> {{ practiceFocus }}</p>
        <p class="muted">{{ t('reviewSoon') }}</p>
      </div>
      <p v-if="feedback==='correct'" class="ok">{{ t('correct') }}</p>
    </template>
    </template>

    <div class="list-toggle">
      <button class="link" @click="showList = !showList">{{ showList ? t('hide') : t('manage') }} {{ t('wordList') }} ({{ savedWords.length }})</button>
    </div>
    <section v-if="showList" class="panel">
      <div class="add-row">
        <input v-model="newWord" :placeholder="t('addph')" @keydown.enter="addWord" class="add-input" />
        <button @click="addWord" class="small">{{ t('add') }}</button>
      </div>
      <label>{{ t('customLanguage') }} <select v-model="customLocale" class="add-input"><option v-for="lang in ['en','de','es']" :key="lang" :value="lang">{{ langName(lang) }}</option></select></label>
      <label class="import-choice"><input type="checkbox" v-model="confirmCustom" /> {{ t('confirmWord') }}</label>
      <p v-if="authForm.error" class="err">{{ authForm.error }}</p>
      <div class="chips">
        <span v-for="w in savedWords" :key="wordKey(w)" class="chip">
          {{ w.word }} · {{ w.locale }} <button @click="removeWord(w)" :aria-label="`remove ${w.word} (${w.locale})`">×</button>
        </span>
        <span v-if="!displayWords.length" class="muted">{{ t('empty') }}</span>
      </div>
      <p class="muted" style="margin-top:12px">{{ mode==='auth' ? t('savedServer') : t('savedLocal') }}</p>
      <div v-if="mode==='auth'" class="chips" style="margin-top:10px">
        <span v-for="w in backendWords" :key="w.id" class="chip" style="font-size:11px">{{ w.word }} {{ w.timesSeen }}× / {{ w.timesCorrect }}✓</span>
      </div>
    </section>

    <section class="panel" style="width:min(560px,94vw)">
      <h3 style="margin:0 0 4px; font-size:16px">{{ t('packs') }}</h3>
      <p v-if="activePackId" class="muted" style="margin:0 0 12px">{{ t('using') }}: <strong>{{ activePackId }}</strong></p>
      <p v-if="packsLoading" class="muted">{{ t('loadingPacks') }}</p>
      <p v-else-if="packsError" class="muted">{{ packsError }}</p>
      <p v-else-if="!packs.length" class="muted">{{ t('packsEmpty') }}</p>
      <div v-else style="display:flex; flex-direction:column; gap:8px">
        <div v-for="p in packs" :key="p.id" class="pack-row" :class="{active: activePackId===p.id}">
          <div style="flex:1; min-width:0">
            <strong>{{ langName(p.locale) }}</strong>
            <span class="muted"> · {{ p.name }} · {{ p.count }} {{ t('wordsLabel') }} · {{ t('difficulty') }} {{ diffLabel(p) }}</span>
          </div>
          <button class="small" @click="usePack(p)" :disabled="packApplying===p.id || activePackId===p.id && !lesson">
            {{ packApplying===p.id ? t('loadingPack') : t('usePack') }}
          </button>
        </div>
      </div>
    </section>
  </main>

  <!-- SELF TEST -->
  <main id="center" v-else-if="view==='test'" class="test-view">
    <template v-if="!testWords.length">
      <div>
        <h2>{{ t('testTitle') }}</h2>
        <p class="muted test-intro">{{ t('testIntro') }}</p>
      </div>
      <div class="nav test-levels" :aria-label="t('lang')">
        <button v-for="lang in testLocales" :key="lang" :class="{active: testLocale===lang}" @click="testLocale=lang">{{ langName(lang) }}</button>
      </div>
      <div class="nav test-levels" :aria-label="t('difficulty')">
        <button v-for="level in (['starter','intermediate','expert'] as TestLevel[])" :key="level" :class="{active: testLevel===level}" @click="testLevel=level">{{ t(level) }}</button>
      </div>
      <button class="cta" @click="startSelfTest" :disabled="testLoading || packsLoading">
        {{ testLoading || packsLoading ? t('loadingPack') : t('startTest') }}
      </button>
    </template>

    <template v-else-if="!testFinished">
      <div class="test-progress">
        <span>{{ t('testProgress') }}</span>
        <strong>{{ testIndex + 1 }} / {{ testWords.length }}</strong>
        <span class="test-progress-bar"><span :style="{ width: ((testIndex + 1) / testWords.length * 100) + '%' }" /></span>
      </div>
      <button class="speak" @click="speak(false, testCurrent?.word, testCurrent?.locale)" aria-label="Speak test word">
        <span class="speak-icon">🔊</span> {{ t('listen') }}
      </button>
      <p class="hint">{{ t('hint') }}</p>
      <form @submit.prevent="submitTestAnswer" class="form">
        <input v-model="testInput" :placeholder="testFeedback==='idle' ? t('typeph') : testFeedback==='correct' ? t('correct') : `${t('was')}: ${testCurrent?.word}`" :class="['spell', testFeedback]" :disabled="testFeedback==='correct'" autocomplete="off" autocapitalize="off" spellcheck="false" />
        <button :class="['cta', testFeedback]" type="submit">
          {{ testFeedback==='idle' ? t('check') : testIndex===testWords.length-1 ? t('finish') : t('next') }}
        </button>
      </form>
      <p v-if="testFeedback==='wrong'" class="reveal" role="status">{{ t('reveal') }} <strong>{{ testCurrent?.word }}</strong> <button class="link" @click="speak(false, testCurrent?.word, testCurrent?.locale)">{{ t('hearAgain') }}</button></p>
      <p v-if="testFeedback==='correct'" class="ok" role="status">{{ t('correct') }}</p>
    </template>

    <template v-else>
      <h2>{{ t('testComplete') }}</h2>
      <div class="test-score" aria-live="polite">
        <strong>{{ testPercent }}%</strong>
        <span>{{ testCorrect }}/{{ testWords.length }} {{ t('right') }}</span>
      </div>
      <div class="stat-cards test-summary">
        <div class="stat-card"><span class="muted">{{ t('right') }}</span><strong>{{ testPercent }}%</strong><em>{{ testCorrect }} {{ t('wordsLabel') }}</em></div>
        <div class="stat-card"><span class="muted">{{ t('wrongLabel') }}</span><strong>{{ 100 - testPercent }}%</strong><em>{{ testWords.length - testCorrect }} {{ t('wordsLabel') }}</em></div>
      </div>
      <button class="small" @click="resetSelfTest">{{ t('testAgain') }}</button>
      <button v-if="testAnswers.some(a=>!a.correct)" class="small secondary" @click="practiceTestMistakes(store.tests[0])">{{ t('mistakes') }}</button>
    </template>

    <section class="panel test-history">
      <h3>{{ t('pastResults') }}</h3>
      <p v-if="!visibleTestResults.length" class="muted">{{ t('noTestResults') }}</p>
      <div v-else class="test-history-list">
        <div v-for="r in visibleTestResults" :key="r.date" class="pack-row">
          <div><strong>{{ langName(r.locale) }} · {{ t(r.level) }}</strong><span class="muted"> · {{ new Date(r.date).toLocaleDateString(locale) }}</span></div>
          <strong>{{ Math.round(r.correct / r.total * 100) }}% <span class="muted">{{ r.correct }}/{{ r.total }}</span></strong>
          <button v-if="r.answers?.some(a=>!a.correct)" class="small" @click="practiceTestMistakes(r)">{{ t('mistakes') }}</button>
        </div>
      </div>
    </section>
  </main>

  <!-- STATISTICS -->
  <main id="center" v-else-if="view==='stats'" style="gap:16px; padding:24px; align-items:stretch; max-width:720px; width:100%; margin:0 auto; box-sizing:border-box">
    <h2 style="text-align:center; margin:0">{{ t('statistics') }}</h2>
    <section class="panel learning-panel">
      <h3>{{ t('independent') }}</h3>
      <div class="retention-cards"><div><strong>{{ fmtAcc(recentAccuracy) }}</strong><span>{{ recentIndependent.length }} {{ t('total') }}</span></div><div><strong>{{ dueCount }}</strong><span>{{ t('due') }}</span></div><div><strong>{{ reviewRows.filter(r=>!r.retained).length }}</strong><span>{{ t('learning') }}</span></div><div><strong>{{ retainedCount }}</strong><span>{{ t('retained') }}</span></div></div>
      <p class="muted">{{ attempts.filter(a=>!eligible(a)).length }} {{ t('assisted') }} · {{ t('recallNote') }}</p>
      <h3>{{ t('recentWords') }}</h3>
      <div v-for="r in rankedReviews.slice(0,10)" :key="r.key" class="review-row"><strong>{{ r.word }} <small>{{ r.locale }}</small></strong><span>{{ r.mistakes }}/{{ r.recent.length }} {{ t('wrongLabel') }} · {{ t('nextReview') }} {{ new Date(r.due).toLocaleDateString(locale) }}</span></div>
      <button class="small" @click="startLesson(true)">{{ t('weakSpots') }}</button>
      <h3>{{ t('patternTitle') }}</h3>
      <p v-if="!supportedPatterns.length" class="muted">{{ t('noPatterns') }}</p>
      <div v-for="p in supportedPatterns.slice(0,2)" :key="p.key" class="review-row"><strong>{{ p.expected }} → {{ p.typed || '∅' }} · {{ p.position }}</strong><span>{{ p.failures }}/{{ p.opportunities }} {{ t('sample') }} ({{ Math.round(p.rate*100) }}%) · {{ p.words.join(', ') }}</span></div>
      <details v-if="attempts.length"><summary>{{ t('assisted') }} / {{ t('independent') }} · {{ t('allTime') }}</summary><div v-for="a in attempts.slice(-20).reverse()" :key="a.id" class="review-row"><strong>{{ a.word }} ← {{ a.submitted }} ({{ a.locale }})</strong><span>{{ a.exercise }} · {{ a.assistance }} · {{ new Date(a.date).toLocaleString(locale) }}</span></div></details>
    </section>
    <p class="muted" style="text-align:center">🔥 {{ stats.streak }} ({{ t('best') }} {{ stats.best }}) · 📅 {{ dayStreak }} {{ t('dayStreak') }} ({{ t('best') }} {{ bestDayStreak }})</p>
    <p style="text-align:center; margin:0">⭐ {{ t('level') }} {{ levelInfo.level }} · {{ currentXp }} {{ t('xp') }} <span class="muted">({{ currentXp - levelInfo.prev }}/{{ levelInfo.next - levelInfo.prev }} {{ t('toNext') }})</span></p>
    <!-- leaderboard: levels derived client-side from XP, hover a row for its XP -->
    <div class="panel" style="width:100%; padding:16px">
      <h3 style="margin:0 0 4px; font-size:14px">{{ t('leaderboard') }} <span class="muted">· {{ t('topLevels') }}</span></h3>
      <p v-if="mode==='guest'" class="muted" style="margin:0 0 8px">{{ t('guestBoardNote') }}</p>
      <ol v-if="board.length" class="board">
        <li v-for="(e, i) in board" :key="e.username" :title="`${e.xp} ${t('xp')}`" :class="{ me: e.username === authUser }">
          <span>#{{ i + 1 }} {{ e.username }}</span><strong>{{ t('level') }} {{ levelForXp(e.xp) }}</strong>
        </li>
      </ol>
      <p v-else class="muted" style="margin:8px 0 0">{{ boardLoading ? '…' : t('noScores') }}</p>
    </div>
    <!-- accuracy cards: today / 7d / 30d / all time + total attempted -->
    <div class="stat-cards">
      <div class="stat-card"><span class="muted">{{ t('today') }}</span><strong>{{ fmtAcc(accToday) }}</strong><em>{{ rangeTotals.today }} {{ t('total') }}</em></div>
      <div class="stat-card"><span class="muted">{{ t('last7') }}</span><strong>{{ fmtAcc(acc7) }}</strong><em>{{ rangeTotals.w7 }} {{ t('total') }}</em></div>
      <div class="stat-card"><span class="muted">{{ t('last30') }}</span><strong>{{ fmtAcc(acc30) }}</strong><em>{{ rangeTotals.m30 }} {{ t('total') }}</em></div>
      <div class="stat-card"><span class="muted">{{ t('allTime') }}</span><strong>{{ accuracy }}%</strong><em>{{ stats.correct }}/{{ stats.total }}✓</em></div>
      <div class="stat-card"><span class="muted">{{ t('attempted') }}</span><strong>{{ stats.total }}</strong><em>{{ t('total') }}</em></div>
    </div>
    <!-- words-typed bar chart with month/week/day switch (day = per hour) -->
    <div class="panel" style="width:100%; padding:16px">
      <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:10px">
        <h3 style="margin:0; font-size:14px">{{ t('wordsTyped') }} <span class="muted">· {{ chartRange==='day' ? t('perHour') : t('perDay') }} · {{ chartTotal }}</span></h3>
        <div class="nav">
          <button :class="{active: chartRange==='month'}" @click="chartRange='month'">{{ t('month') }}</button>
          <button :class="{active: chartRange==='week'}" @click="chartRange='week'">{{ t('week') }}</button>
          <button :class="{active: chartRange==='day'}" @click="chartRange='day'">{{ t('day') }}</button>
        </div>
      </div>
      <div v-if="!chartTotal" class="muted">{{ t('noData') }}</div>
      <div v-else class="bars">
        <div v-for="(b, i) in chartBars" :key="i" class="bar-col" :title="b.title">
          <div class="bar" :style="{ height: Math.max(3, Math.round(b.value / chartMax * 100)) + '%' }" />
          <span v-if="chartRange==='day' ? i % 3 === 0 : chartBars.length <= 8 || i % Math.ceil(chartBars.length / 8) === 0" class="bar-label">{{ b.label }}</span>
        </div>
      </div>
    </div>
    <!-- per-word list kept at the bottom, collapsed by default -->
    <details class="panel" style="width:100%; padding:0">
      <summary style="padding:12px; font-size:14px; font-weight:700; cursor:pointer">{{ t('wordDetails') }} <span class="muted">· {{ perWordRows.length }}</span></summary>
      <details v-for="(l, li) in statTree" :key="l.key" style="border-top:0.5px solid var(--border)" :open="li===0">
        <summary style="padding:10px 12px 10px 24px; font-size:13px; font-weight:600; cursor:pointer">{{ l.title }} <span class="muted">· {{ l.avg == null ? '—' : l.avg + '%' }} {{ t('avgAcc') }}</span></summary>
        <details v-for="b in l.bands" :key="b.key" style="border-top:0.5px solid var(--border)">
          <summary style="padding:10px 12px 10px 24px; font-size:13px; font-weight:600; cursor:pointer">{{ b.title }} <span class="muted">· {{ b.avg == null ? '—' : b.avg + '%' }} {{ t('avgAcc') }} · {{ b.rows.length }}</span></summary>
          <table class="stat-table">
            <thead><tr><th>{{ t('word') }}</th><th>{{ t('seen') }}</th><th>{{ t('correctH') }}</th><th>{{ t('accuracy') }}</th></tr></thead>
            <tbody>
              <tr v-for="r in b.rows" :key="r.word">
                <td><strong>{{ r.word }}</strong></td><td>{{ r.seen }}</td><td>{{ r.correct }}</td><td :style="{color: r.acc<60 ? '#ef4444' : r.acc<85 ? '#d97706' : '#16a34a'}">{{ r.seen? r.acc+'%':'—' }}</td>
              </tr>
            </tbody>
          </table>
        </details>
      </details>
      <p v-if="!statTree.length" class="muted" style="text-align:center; padding:12px">{{ t('empty') }}</p>
    </details>
  </main>

  <!-- SETTINGS -->
  <main id="center" v-else style="gap:20px; padding:24px; align-items:stretch; max-width:640px; width:100%; margin:0 auto; box-sizing:border-box">
    <h2 style="text-align:center; margin:0">{{ t('settings') }}</h2>
    <section class="panel theme-panel" style="width:100%">
      <h3 style="margin:0 0 4px; font-size:17px; letter-spacing:-0.02em">{{ t('theme') }}</h3>
      <p class="muted" style="margin:0 0 12px">{{ t('preset') }}</p>
      <div class="presets">
        <button
          v-for="p in PRESETS" :key="p.id"
          class="preset" :class="{active: activePreset===p.id}"
          @click="pickPreset(p.id)" :title="p.label"
        >
          <span class="swatch" :style="{ background: p.theme.bg, borderColor: p.theme.secondary }">
            <span class="dot" :style="{ background: p.theme.primary }"></span>
            <span class="dot-txt" :style="{ background: p.theme.text }"></span>
          </span>
          {{ p.label }}
        </button>
      </div>
      <p class="muted" style="margin:14px 0 10px">{{ t('custom') }}</p>
      <div class="settings-grid">
        <label>{{ t('primary') }} <input type="color" v-model="theme.primary" /></label>
        <label>{{ t('secondary') }} <span class="muted" style="font-size:11px">{{ t('secondaryNote') }}</span> <input type="color" v-model="theme.secondary" /></label>
        <label>{{ t('textColor') }} <input type="color" v-model="theme.text" /></label>
        <label>{{ t('background') }} <input type="color" v-model="theme.bg" /></label>
        <label style="grid-column:1/-1">{{ t('font') }}
          <select v-model="theme.font" class="add-input">
            <option v-for="f in fonts" :key="f" :value="f">{{ f.split(',')[0].replace(/['"]/g,'') }}</option>
          </select>
        </label>
      </div>
      <button class="small" @click="resetTheme" style="margin-top:12px">{{ t('resetTheme') }}</button>
    </section>
    <section class="panel" style="width:100%">
      <h3 style="margin:0 0 12px; font-size:16px">{{ t('lang') }}</h3>
      <p class="muted" style="margin-bottom:8px">{{ t('appLangNote') }}</p>
      <div style="display:flex; gap:8px">
        <button :class="['small', locale==='en' ? '' : 'secondary']" @click="locale='en'" :style="locale==='en'? 'background:var(--accent);color:#fff;border-color:var(--accent)':''">English</button>
        <button :class="['small', locale==='es' ? '' : 'secondary']" @click="locale='es'" :style="locale==='es'? 'background:var(--accent);color:#fff;border-color:var(--accent)':''">Español</button>
      </div>
    </section>
    <section class="panel" style="width:100%">
      <h3 style="margin:0 0 12px; font-size:16px">{{ t('defSettings') }}</h3>
      <button class="small" @click="resetAll">{{ t('resetAll') }}</button>
    </section>
  </main>

  <footer class="foot">{{ mode==='auth' ? t('synced')+' · ' : t('offline') }}{{ t('noTracking') }}</footer>
</template>

<style scoped>
/* Apple HIG: frosted bar, segmented control, soft cards, SF tracking */
.top {
  display:flex; justify-content:space-between; align-items:center;
  padding:14px 20px; border-bottom:0.5px solid var(--border);
  position:sticky; top:0; z-index:10; gap:12px; flex-wrap:wrap;
  background: color-mix(in srgb, var(--bg) 72%, transparent);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  backdrop-filter: blur(20px) saturate(180%);
}
.brand { font-weight:700; font-size:17px; color:var(--text-h); letter-spacing:-0.02em; }
.brand span { font-weight:600; font-size:11px; background:var(--accent-bg); color:var(--accent); padding:2px 8px; border-radius:var(--radius-full); margin-left:6px; }
.nav { display:flex; gap:0; background:var(--fill); border-radius:var(--radius-full); padding:2px; }
.nav button { padding:7px 16px; border-radius:var(--radius-full); border:none; background:transparent; color:var(--text-h); cursor:pointer; font-weight:600; font-size:13px; transition: all var(--duration-fast) var(--easing); min-height:32px; }
.nav button.active { background:color-mix(in srgb, var(--bg) 92%, transparent); color:var(--text-h); box-shadow:var(--shadow-sm); }
.nav button:disabled { opacity:0.4; cursor:not-allowed; }
.stats { display:flex; gap:14px; align-items:center; font-family:var(--mono); font-size:13px; color:var(--text-h); }
.stats em { color:var(--text); font-style:normal; font-size:11px; }
.authbar { display:flex; gap:12px; align-items:center; justify-content:space-between; padding:10px 20px; border-bottom:0.5px solid var(--border); background:var(--social-bg); flex-wrap:wrap; }
.auth-row { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
.secondary { background:var(--accent-bg)!important; color:var(--accent)!important; border-color:transparent!important; }
.err { color:#ff3b30; font-size:13px; margin:4px 0 0; width:100%; }
.speak {
  font-size:22px; padding:20px 44px; border-radius:24px; border:none;
  background:var(--accent); color:#fff; cursor:pointer; font-weight:700; letter-spacing:-0.02em;
  box-shadow:var(--shadow-lg); transition: transform var(--duration-fast) var(--easing), box-shadow var(--duration-normal) var(--easing), filter var(--duration-fast);
}
.speak:hover { transform:translateY(-1px); filter:brightness(1.06); box-shadow:var(--shadow-lg); }
.speak:active { transform:scale(0.98); }
.speak-icon { margin-right:8px; }
.hint { font-size:13px; color:var(--text); margin-top:-12px; }
.repeat-word {
  font-size: 36px;
  font-weight: 700;
  color: var(--text-h);
  letter-spacing: 0.04em;
  margin: 0;
  user-select: all;
}
.form { display:flex; gap:10px; width:min(440px, 92vw); }
.spell {
  flex:1; font-size:20px; padding:14px 18px; border-radius:var(--radius-md);
  border:1.5px solid var(--border); background:color-mix(in srgb, var(--bg) 85%, transparent);
  color:var(--text-h); outline:none; text-align:center; letter-spacing:-0.01em;
  transition: border-color var(--duration-fast) var(--easing), box-shadow var(--duration-fast) var(--easing);
}
.spell:focus { border-color:var(--accent); box-shadow:0 0 0 4px var(--accent-bg); }
.spell.correct { border-color:#34c759; background:color-mix(in srgb, #34c759 10%, var(--bg)); }
.spell.wrong { animation: errorFade 1s ease-out; }
@keyframes errorFade { 0% { border-color:#ff3b30; background:color-mix(in srgb, #ff3b30 20%, var(--bg)); } 100% { border-color:var(--border); background:color-mix(in srgb, #ff3b30 0%, var(--bg)); } }
.cta { padding:14px 22px; border-radius:var(--radius-md); border:none; background:var(--text-h); color:var(--bg); font-weight:700; font-size:15px; cursor:pointer; white-space:nowrap; transition: transform var(--duration-fast) var(--easing), opacity var(--duration-fast); }
.cta:hover { opacity:0.88; }
.cta:active { transform:scale(0.97); }
.cta.correct { background:#34c759; color:#fff; }
.cta.wrong { background:var(--fill); color:var(--text-h); }
.reveal, .ok { font-size:15px; }
.ok { color:#34c759; font-weight:700; }
.link { background:none; border:none; color:var(--accent); cursor:pointer; font-size:13px; min-height:32px; }
.link:hover { text-decoration:underline; text-underline-offset:3px; }
.panel {
  width:min(560px, 94vw); box-sizing:border-box; text-align:left; border:0.5px solid var(--border);
  border-radius:var(--radius-lg); padding:20px; background:var(--social-bg);
  box-shadow:var(--shadow-sm);
}
.add-row { display:flex; gap:8px; }
.add-input { flex:1; padding:10px 14px; border-radius:var(--radius-sm); border:0.5px solid var(--border); background:color-mix(in srgb, var(--bg) 85%, transparent); color:var(--text-h); font-size:15px; }
.small { padding:9px 16px; border-radius:var(--radius-full); border:0.5px solid var(--border); background:color-mix(in srgb, var(--bg) 85%, transparent); cursor:pointer; font-weight:600; font-size:13px; color:var(--accent); transition: all var(--duration-fast) var(--easing); min-height:36px; }
.small:hover { background:var(--accent-bg); border-color:transparent; }
.chips { display:flex; flex-wrap:wrap; gap:8px; margin-top:14px; }
.chip { display:inline-flex; gap:6px; align-items:center; padding:7px 12px; border-radius:var(--radius-full); background:color-mix(in srgb, var(--bg) 85%, transparent); border:0.5px solid var(--border); font-size:13px; font-weight:500; color:var(--text-h); }
.chip button { border:none; background:none; cursor:pointer; font-size:16px; line-height:1; color:var(--text); min-height:24px; min-width:24px; }
.muted { font-size:12px; color:var(--text); }
.foot { text-align:center; padding:16px; border-top:0.5px solid var(--border); font-size:11px; color:var(--text); }
.pack-row { display:flex; gap:10px; align-items:center; padding:10px 12px; border:0.5px solid var(--border); border-radius:var(--radius-md); background:color-mix(in srgb, var(--bg) 85%, transparent); font-size:14px; }
.pack-row.active { border-color:var(--accent); background:var(--accent-bg); }
.stat-cards { display:grid; grid-template-columns:repeat(5, 1fr); gap:8px; width:100%; }
.stat-card { display:flex; flex-direction:column; gap:2px; align-items:center; padding:12px 6px; border:0.5px solid var(--border); border-radius:var(--radius-md); background:var(--social-bg); text-align:center; }
.stat-card strong { font-size:22px; color:var(--text-h); letter-spacing:-0.02em; }
.stat-card em { font-style:normal; font-size:11px; color:var(--text); }
.bars { display:flex; align-items:flex-end; gap:4px; height:140px; overflow-x:auto; padding-top:8px; }
.bar-col { flex:1; min-width:14px; display:flex; flex-direction:column; align-items:center; justify-content:flex-end; gap:4px; height:100%; }
.bar { width:100%; max-width:22px; border-radius:4px 4px 2px 2px; background:var(--accent); opacity:0.85; }
.bar-label { font-size:9px; color:var(--text); }
/* Presets */
.presets { display:grid; grid-template-columns:repeat(4, 1fr); gap:8px; }
.preset {
  display:flex; flex-direction:column; align-items:center; gap:6px; padding:10px 4px;
  border-radius:var(--radius-md); border:1.5px solid transparent; background:transparent;
  color:var(--text-h); font-size:11px; font-weight:600; cursor:pointer;
  transition: all var(--duration-fast) var(--easing);
}
.preset:hover { background:var(--accent-bg); }
.preset.active { border-color:var(--accent); background:var(--accent-bg); }
.swatch {
  width:44px; height:32px; border-radius:9px; border:1px solid var(--border);
  display:flex; align-items:center; justify-content:center; gap:4px;
}
.swatch .dot { width:12px; height:12px; border-radius:50%; }
.swatch .dot-txt { width:16px; height:6px; border-radius:3px; opacity:0.85; }
.theme-panel { background:color-mix(in srgb, var(--bg) 70%, transparent); -webkit-backdrop-filter:blur(12px); backdrop-filter:blur(12px); }
.stat-table { width:100%; border-collapse:separate; border-spacing:0; font-size:14px; }
.stat-table th, .stat-table td { padding:10px 12px; border-bottom:0.5px solid var(--border); text-align:left; }
.xpbar { width:64px; height:6px; border-radius:3px; background:var(--fill); overflow:hidden; }
.xpbar span { display:block; height:100%; background:var(--accent); border-radius:3px; transition:width 0.3s; }
.board { list-style:none; margin:8px 0 0; padding:0; display:flex; flex-direction:column; gap:6px; }
.board li { display:flex; justify-content:space-between; align-items:center; padding:8px 12px; border:0.5px solid var(--border); border-radius:var(--radius-md); font-size:14px; cursor:default; }
.board li.me { border-color:var(--accent); background:var(--accent-bg); }
.stat-table th { font-size:11px; text-transform:uppercase; letter-spacing:0.06em; color:var(--text); font-weight:700; }
.stat-table tr:last-child td { border-bottom:none; }
.settings-grid { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
.settings-grid label { display:flex; flex-direction:column; gap:6px; font-size:13px; font-weight:600; color:var(--text-h); }
.settings-grid input[type="color"] { height:40px; border-radius:var(--radius-sm); border:0.5px solid var(--border); padding:3px; width:100%; background:var(--bg); cursor:pointer; }
.test-view { justify-content:flex-start!important; }
.test-intro { max-width:460px; margin-top:6px; font-size:14px; }
.test-levels { width:min(420px, 100%); }
.test-levels button { min-height:44px; }
.test-progress { width:min(440px, 92vw); display:grid; grid-template-columns:1fr auto; gap:6px; text-align:left; font-size:13px; color:var(--text); }
.test-progress strong { color:var(--text-h); }
.test-progress-bar { grid-column:1/-1; height:7px; overflow:hidden; border-radius:var(--radius-full); background:var(--fill); }
.test-progress-bar span { display:block; height:100%; border-radius:inherit; background:var(--accent); transition:width var(--duration-normal) var(--easing); }
.test-score { display:flex; flex-direction:column; align-items:center; }
.test-score strong { font-size:64px; line-height:1; color:var(--text-h); letter-spacing:-0.05em; }
.test-score span { margin-top:8px; color:var(--text); }
.test-summary { width:min(420px, 100%); grid-template-columns:repeat(2, 1fr); }
.test-history { margin-top:20px; width:100%; box-sizing:border-box; }
.test-history h3 { margin:0 0 12px; font-size:16px; }
.test-history-list { display:flex; flex-direction:column; gap:8px; }
.test-history-list .pack-row { justify-content:space-between; }
.save-status { display:flex; align-items:center; justify-content:center; gap:8px; font-size:12px; padding:4px 16px; color:var(--text); }
.learning-panel { box-sizing:border-box; width:min(600px,100%); }
.learning-panel h3 { margin:16px 0 8px; font-size:16px; }
.lesson-heading { display:flex; flex-direction:column; gap:12px; }
.lesson-heading > strong { color:var(--accent); font-size:14px; }
.lesson-actions { display:flex; flex-wrap:wrap; gap:8px; margin-top:16px; }
.lesson-actions button, .import-choice { min-height:44px; }
.lesson-progress { margin-top:12px; font-weight:600; }
.lesson-summary { display:flex; flex-direction:column; gap:12px; box-sizing:border-box; }
.import-choice { display:flex; align-items:center; gap:8px; font-size:13px; }
.changed-spans { display:flex; flex-wrap:wrap; gap:12px; justify-content:center; margin:8px 0; }
.changed-spans mark { background:var(--accent-bg); color:var(--text-h); padding:2px 5px; border-radius:4px; font-weight:700; }
.retention-cards { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin:12px 0; }
.retention-cards > div { display:flex; flex-direction:column; gap:4px; }
.retention-cards strong { font-size:28px; color:var(--text-h); }
.retention-cards span { font-size:13px; }
.review-row { display:flex; flex-direction:column; gap:3px; padding:10px 0; border-top:1px solid var(--border); overflow-wrap:anywhere; }
.review-row strong { font-size:14px; color:var(--text-h); }
.review-row span { font-size:12px; }
.correction { max-width:560px; }
@media (min-width:600px) { .lesson-heading { flex-direction:row; align-items:center; justify-content:space-between; } .retention-cards {grid-template-columns:repeat(4,1fr);} }
@media (max-width:700px){
  .form{ flex-direction:column } .top{ flex-direction:column; gap:10px; padding:12px 16px }
  .nav{ width:100%; } .nav button{ flex:1; min-height:44px; }
  .small, .link { min-height:44px; }
  .add-input { min-width:0; font-size:16px; }
  .authbar{ flex-direction:column; align-items:stretch }
  .settings-grid{ grid-template-columns:1fr } .presets{ grid-template-columns:repeat(4, 1fr); }
  .speak{ width:100%; }
  .stat-cards{ grid-template-columns:repeat(2, 1fr); }
  .top > .nav button{ padding-inline:8px; font-size:12px; min-height:44px; }
}
</style>
