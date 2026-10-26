<script setup lang="ts">
import { provideSpellingApp } from './appContext'
import AppHeader from './components/AppHeader.vue'
import PracticePage from './pages/PracticePage.vue'
import WordsPage from './pages/WordsPage.vue'
import TestPage from './pages/TestPage.vue'
import StatisticsPage from './pages/StatisticsPage.vue'
import SettingsPage from './pages/SettingsPage.vue'

const { t, view, mode, saveState, pendingCount, syncLearning, resetting, syncError } = provideSpellingApp()
</script>

<template>
  <AppHeader />
  <div class="save-status" role="status" aria-live="polite">
    {{ saveState==='failed' ? 'Could not save on this device. Keep this page open and free browser storage.' : saveState==='saving' ? t('saving') : mode==='auth' && pendingCount ? t('unsaved') : t('saved') }}
    <button v-if="mode==='auth'" class="link" @click="syncLearning" :disabled="saveState==='saving' || resetting">{{ t('retrySave') }}</button>
  </div>
  <p v-if="syncError" class="err" role="alert">{{ syncError }}</p>

  <PracticePage v-if="view==='practice'" />
  <WordsPage v-else-if="view==='words'" />
  <TestPage v-else-if="view==='test'" />
  <StatisticsPage v-else-if="view==='stats'" />
  <SettingsPage v-else />

  <footer class="foot">{{ mode==='auth' ? t('synced')+' · ' : t('offline') }}{{ t('noTracking') }}</footer>
</template>

<style src="./styles/app.css"></style>
