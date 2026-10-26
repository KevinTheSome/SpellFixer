<script setup lang="ts">
import { useSpellingApp } from '../appContext'
import { wordKey } from '../learning'

const {
  t, view, mode, newWord, wordSaving, addWord, customLocale, langName, confirmCustom,
  wordError, wordMessage, savedWords, removeWord, manualPractice, showList,
} = useSpellingApp()
</script>

<template>
  <section class="panel word-manager" :aria-label="t('myWords')">
    <h2 v-if="view==='practice'">{{ t('myWords') }}</h2>
    <p v-if="view==='practice'" class="muted">{{ mode==='auth' ? t('savedServer') : t('savedLocal') }}</p>
    <form @submit.prevent="addWord" class="add-row">
      <input v-model="newWord" :placeholder="t('addph')" :aria-label="t('addph')" maxlength="50" required autocomplete="off" class="add-input" />
      <button type="submit" class="small" :disabled="wordSaving">{{ wordSaving ? t('saving') : t('add') }}</button>
    </form>
    <label>{{ t('customLanguage') }} <select v-model="customLocale" class="add-input" :disabled="wordSaving"><option v-for="lang in ['en','de','es']" :key="lang" :value="lang">{{ langName(lang) }}</option></select></label>
    <label class="import-choice"><input type="checkbox" v-model="confirmCustom" /> {{ t('confirmWord') }}</label>
    <p v-if="wordError" class="err" role="alert">{{ wordError }}</p>
    <p v-if="wordMessage" class="muted" role="status">{{ wordMessage }}</p>
    <div class="chips">
      <span v-for="w in savedWords" :key="wordKey(w)" class="chip">
        {{ w.word }} · {{ w.locale }} <button @click="removeWord(w)" :aria-label="`remove ${w.word} (${w.locale})`">×</button>
      </span>
      <span v-if="!savedWords.length" class="muted">{{ t('empty') }}</span>
    </div>
    <button class="small" :disabled="!savedWords.length" @click="manualPractice(); showList=false; view='practice'">{{ t('practiceWords') }}</button>
  </section>
</template>
