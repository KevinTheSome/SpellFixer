<script setup lang="ts">
import { useSpellingApp } from '../appContext'
import WordManager from '../components/WordManager.vue'

const { t } = useSpellingApp()
</script>

<template>
  <main id="center" class="words-view" :aria-label="t('myWords')">
    <WordManager />
  </main>
</template>
