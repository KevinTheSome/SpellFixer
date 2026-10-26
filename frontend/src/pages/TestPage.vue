<script setup lang="ts">
import { useSpellingApp } from '../appContext'
import type { TestLevel } from '../composables/useSelfTest'

const {
  t, locale, testWords, testLocales, testLocale, testLoading, langName, testLevel, startSelfTest,
  packsLoading, testFinished, testIndex, speak, testCurrent, submitTestAnswer, testInput,
  testFeedback, resetting, testPercent, testCorrect, resetSelfTest, testAnswers, practiceTestMistakes,
  store, visibleTestResults,
} = useSpellingApp()
</script>

<template>
  <main id="center" class="test-view" :aria-label="t('selfTest')">
    <section class="panel test-session">
      <template v-if="!testWords.length">
        <div class="nav test-levels" :aria-label="t('lang')">
          <button v-for="lang in testLocales" :key="lang" :class="{active: testLocale===lang}" @click="testLocale=lang" :disabled="testLoading">{{ langName(lang) }}</button>
        </div>
        <div class="nav test-levels" :aria-label="t('difficulty')">
          <button v-for="level in (['starter','intermediate','expert'] as TestLevel[])" :key="level" :class="{active: testLevel===level}" @click="testLevel=level" :disabled="testLoading">{{ t(level) }}</button>
        </div>
        <button class="cta" @click="startSelfTest" :disabled="testLoading || packsLoading">{{ testLoading || packsLoading ? t('loadingPack') : t('startTest') }}</button>
      </template>
      <template v-else-if="!testFinished">
        <div class="test-progress">
          <span>{{ t('testProgress') }}</span>
          <strong>{{ testIndex + 1 }} / {{ testWords.length }}</strong>
          <span class="test-progress-bar"><span :style="{ width: ((testIndex + 1) / testWords.length * 100) + '%' }" /></span>
        </div>
        <button class="speak" @click="speak(false, testCurrent?.word, testCurrent?.locale)" aria-label="Speak test word"><span class="speak-icon">🔊</span> {{ t('listen') }}</button>
        <form @submit.prevent="submitTestAnswer" class="form">
          <input v-model="testInput" :placeholder="testFeedback==='idle' ? t('typeph') : testFeedback==='correct' ? t('correct') : `${t('was')}: ${testCurrent?.word}`" :class="['spell', testFeedback]" :disabled="testFeedback==='correct' || resetting" maxlength="200" aria-label="Your test spelling" autocomplete="off" autocapitalize="off" spellcheck="false" />
          <button :class="['cta', testFeedback]" type="submit" :disabled="resetting">{{ testFeedback==='idle' ? t('check') : testIndex===testWords.length-1 ? t('finish') : t('next') }}</button>
        </form>
        <p v-if="testFeedback==='wrong'" class="reveal" role="status">{{ t('reveal') }} <strong>{{ testCurrent?.word }}</strong> <button class="link" @click="speak(false, testCurrent?.word, testCurrent?.locale)">{{ t('hearAgain') }}</button></p>
        <p v-if="testFeedback==='correct'" class="ok" role="status">{{ t('correct') }}</p>
      </template>
      <template v-else>
        <h2>{{ t('testComplete') }}</h2>
        <div class="test-score" aria-live="polite"><strong>{{ testPercent }}%</strong><span>{{ testCorrect }}/{{ testWords.length }} {{ t('right') }}</span></div>
        <div class="stat-cards test-summary">
          <div class="stat-card"><span class="muted">{{ t('right') }}</span><strong>{{ testPercent }}%</strong><em>{{ testCorrect }} {{ t('wordsLabel') }}</em></div>
          <div class="stat-card"><span class="muted">{{ t('wrongLabel') }}</span><strong>{{ 100 - testPercent }}%</strong><em>{{ testWords.length - testCorrect }} {{ t('wordsLabel') }}</em></div>
        </div>
        <button class="small" @click="resetSelfTest">{{ t('testAgain') }}</button>
        <button v-if="testAnswers.some(a=>!a.correct)" class="small secondary" @click="practiceTestMistakes(store.tests[0])">{{ t('mistakes') }}</button>
      </template>
    </section>
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
</template>
