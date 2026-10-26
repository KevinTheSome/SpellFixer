<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useSpellingApp } from '../appContext'

const {
  t, view, currentXp, levelInfo, xpPct, stats, dayStreak, bestDayStreak, accuracy,
  resetStats, resetting, mode, authUser, authForm, authLoading, importGuest, login, register, logout,
} = useSpellingApp()

const accountTrigger = ref<HTMLButtonElement|null>(null)
const accountPanel = ref<HTMLElement|null>(null)
function positionAccount() {
  if (!accountTrigger.value || !accountPanel.value) return
  const top=Math.min(accountTrigger.value.getBoundingClientRect().bottom+8,Math.max(16,window.innerHeight-256))
  accountPanel.value.style.setProperty('--account-top',`${Math.max(8,top)}px`)
}
onMounted(() => window.addEventListener('resize', positionAccount))
onUnmounted(() => window.removeEventListener('resize', positionAccount))
</script>

<template>
  <header class="top">
    <div class="brand">SpellingTeacher</div>
    <nav class="nav">
      <button :class="{active: view==='practice'}" @click="view='practice'">{{ t('practice') }}</button>
      <button :class="{active: view==='words'}" @click="view='words'">{{ t('myWords') }}</button>
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
      <div class="header-actions">
        <button class="link" @click="resetStats" v-if="stats.total" :disabled="resetting || mode==='auth' && !authUser">{{ t('clearStats') }}</button>
        <button ref="accountTrigger" class="small account-trigger" popovertarget="account-panel" aria-haspopup="dialog" :aria-label="t('account')"><span>{{ mode==='guest' ? t('login') : authUser }}</span> <span aria-hidden="true">▾</span></button>
      </div>
    </div>
  </header>

  <div id="account-panel" ref="accountPanel" popover class="authbar" role="dialog" :aria-label="t('account')" @beforetoggle="positionAccount">
    <div class="account-heading"><strong>{{ t('account') }}</strong><button class="link" popovertarget="account-panel" popovertargetaction="hide" :aria-label="t('close')">×</button></div>
    <template v-if="mode==='guest'">
      <p class="muted">{{ t('guestNote') }}</p>
      <form @submit.prevent="login" class="auth-row">
        <label>{{ t('username') }}<input v-model="authForm.username" :placeholder="t('username')" autocomplete="username" class="add-input" autofocus /></label>
        <label>{{ t('password') }}<input v-model="authForm.password" type="password" :placeholder="t('password')" autocomplete="current-password" class="add-input" /></label>
        <div class="auth-actions">
          <button type="submit" :disabled="authLoading" class="small">{{ t('login') }}</button>
          <button type="button" @click="register" :disabled="authLoading" class="small secondary">{{ t('register') }}</button>
        </div>
        <label class="import-choice"><input type="checkbox" v-model="importGuest" /> {{ t('importGuest') }}</label>
        <p class="muted">{{ t('importNote') }}</p>
      </form>
    </template>
    <template v-else>
      <p class="muted">{{ t('synced') }} <strong>{{ authUser }}</strong> — {{ t('wordsAndStats') }}</p>
      <button @click="logout" class="small" :disabled="resetting">{{ t('logout') }}</button>
    </template>
    <p v-if="authForm.error" class="err" role="alert">{{ authForm.error }}</p>
  </div>
</template>
