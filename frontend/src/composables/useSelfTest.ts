import { ref, computed, watch, type Ref } from 'vue'
import { api, type PackMeta, type PackEntry } from '../api'
import { isCorrect, type LearningWord, type SavedTest, type Attempt, type LearningStore } from '../learning'
import { shuffled } from '../utils'
import type { useAudio } from './useAudio'

export const LS_TEST_RESULTS = 'st-test-results'
export type TestLevel = 'starter'|'intermediate'|'expert'

export function useSelfTest({ contentLocale, mode, authUser, packs, packEntries, store, resetting, recordAnswer, persistLearning, syncLearning, speak }: {
  contentLocale: Ref<string>
  mode: Ref<'guest'|'auth'>
  authUser: Ref<string>
  packs: Ref<PackMeta[]>
  packEntries: Ref<Record<string, PackEntry[]>>
  store: Ref<LearningStore>
  resetting: Ref<boolean>
  recordAnswer: (w:LearningWord, answer:string, exercise:Attempt['exercise'], assistance:Attempt['assistance'], session?:string) => Attempt|null
  persistLearning: () => void
  syncLearning: () => Promise<void>
  speak: ReturnType<typeof useAudio>['speak']
}) {
  const testLevel = ref<TestLevel>('starter')
  const testLocale = ref(contentLocale.value)
  const testWords = ref<LearningWord[]>([])
  const testIndex = ref(0)
  const testInput = ref('')
  const testFeedback = ref<'idle'|'correct'|'wrong'>('idle')
  const testCorrect = ref(0)
  const testAnswers = ref<Attempt[]>([])
  const testSession = ref(crypto.randomUUID())
  const testLoading = ref(false)
  const testResults = ref<SavedTest[]>(JSON.parse(localStorage.getItem(LS_TEST_RESULTS) || '[]'))
  const testOwner = computed(() => mode.value === 'auth' ? authUser.value : 'guest')
  const visibleTestResults = computed(() => store.value.tests)
  const testLocales = computed(() => [...new Set(packs.value.map(p => p.locale))].sort())
  const testCurrent = computed(() => testWords.value[testIndex.value])
  const testFinished = computed(() => testWords.value.length > 0 && testIndex.value >= testWords.value.length)
  const testPercent = computed(() => testWords.value.length ? Math.round(testCorrect.value / testWords.value.length * 100) : 0)
  watch(testResults, v => localStorage.setItem(LS_TEST_RESULTS, JSON.stringify(v)), { deep:true })

  async function startSelfTest() {
    const session=crypto.randomUUID(), selectedLocale=testLocale.value, selectedLevel=testLevel.value
    testSession.value=session
    testLoading.value = true
    try {
      const localPacks = packs.value.filter(p => p.locale === selectedLocale && ['starter','intermediate','expert'].includes(p.name))
      for (const p of localPacks) if (!packEntries.value[p.id]) packEntries.value[p.id] = await api.getPack(p.locale, p.name)
      if(testSession.value!==session) return
      const chosen = localPacks.find(p => p.name === selectedLevel)
      if (!chosen) return
      const primary = packEntries.value[chosen.id] ?? []
      const primaryWords = new Set(primary.map(e => e.word.toLowerCase()))
      const mixed = localPacks.filter(p => p.id !== chosen.id).flatMap(p => packEntries.value[p.id] ?? []).filter(e => !primaryWords.has(e.word.toLowerCase()))
      const entries = [...shuffled(primary).slice(0, 8), ...shuffled(mixed).slice(0, 2)]
      testWords.value = shuffled(entries)
      testAnswers.value=[]; testLocale.value=selectedLocale; testLevel.value=selectedLevel
      testIndex.value = 0; testCorrect.value = 0; testInput.value = ''; testFeedback.value = 'idle'
      if (testCurrent.value) speak(false, testCurrent.value.word, testCurrent.value.locale)
    } finally { if(testSession.value===session) testLoading.value = false }
  }

  function submitTestAnswer() {
    if(resetting.value) return
    const currentWord = testCurrent.value
    if (!currentWord || !testInput.value.trim()) return
    if (testFeedback.value === 'idle') {
      const ok = isCorrect(currentWord,testInput.value)
      const a=recordAnswer(currentWord,testInput.value,'test','none',testSession.value)
      if(!a) return
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
    testAnswers.value=[];testSession.value=crypto.randomUUID();testLoading.value=false
  }
  return {
    testLevel, testLocale, testWords, testIndex, testInput, testFeedback, testCorrect, testAnswers,
    testLoading, testResults, testOwner, visibleTestResults, testLocales, testCurrent, testFinished,
    testPercent, startSelfTest, submitTestAnswer, resetSelfTest,
  }
}
