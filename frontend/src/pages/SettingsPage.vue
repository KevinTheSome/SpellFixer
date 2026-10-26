<script setup lang="ts">
import { ref, watch } from 'vue'
import { useSpellingApp } from '../appContext'

const {
  t, PRESETS, activePreset, pickPreset, theme, fonts, resetTheme, locale, resetAll,
  mode, authUser, authLoading, wordSaving, resetting, deleteAccountData,
} = useSpellingApp()
const accountPassword = ref('')
const accountError = ref('')
const accountMessage = ref('')
watch(authUser, () => { accountPassword.value=''; accountError.value=''; accountMessage.value='' })

async function confirmDeletion(removeAccount: boolean) {
  if (!accountPassword.value || resetting.value) return
  accountError.value='';accountMessage.value=''
  if (!window.confirm(`${t(removeAccount ? 'confirmDeleteAccount' : 'confirmDeleteData')}\n\n${authUser.value}`)) return
  try {
    if (await deleteAccountData(accountPassword.value,removeAccount)) {
      accountPassword.value=''
      accountMessage.value=t(removeAccount ? 'accountDeleted' : 'dataDeleted')
    }
  } catch (error) {
    accountError.value=error instanceof Error ? error.message : String(error)
  }
}
</script>

<template>
  <main id="center" class="settings-view" :aria-label="t('settings')">
    <section class="panel theme-panel">
      <h3>{{ t('theme') }}</h3>
      <p class="muted" style="margin:0 0 12px">{{ t('preset') }}</p>
      <div class="presets">
        <button v-for="p in PRESETS" :key="p.id" class="preset" :class="{active: activePreset===p.id}" @click="pickPreset(p.id)" :title="p.label">
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
          <select v-model="theme.font" class="add-input"><option v-for="f in fonts" :key="f" :value="f">{{ f.split(',')[0].replace(/['"]/g,'') }}</option></select>
        </label>
      </div>
      <button class="small" @click="resetTheme" style="margin-top:12px">{{ t('resetTheme') }}</button>
    </section>
    <div class="sidebar settings-sidebar">
      <section class="panel">
        <h3>{{ t('lang') }}</h3>
        <p class="muted" style="margin-bottom:8px">{{ t('appLangNote') }}</p>
        <div style="display:flex; gap:8px">
          <button :class="['small', locale==='en' ? '' : 'secondary']" @click="locale='en'" :style="locale==='en'? 'background:var(--accent);color:var(--on-accent);border-color:var(--accent)':''">English</button>
          <button :class="['small', locale==='es' ? '' : 'secondary']" @click="locale='es'" :style="locale==='es'? 'background:var(--accent);color:var(--on-accent);border-color:var(--accent)':''">Español</button>
        </div>
      </section>
      <section class="panel"><h3>{{ t('defSettings') }}</h3><button class="small" @click="resetAll">{{ t('resetAll') }}</button></section>
      <section v-if="mode==='auth'" class="panel account-data" :aria-label="t('accountData')" :aria-busy="resetting">
        <h3>{{ t('accountData') }} · {{ authUser }}</h3>
        <label class="account-password">{{ t('currentPassword') }}<input v-model="accountPassword" class="add-input" type="password" autocomplete="current-password" :disabled="resetting || authLoading || wordSaving || !authUser" /></label>
        <div class="account-delete-row">
          <p>{{ t('deleteDataNote') }}</p>
          <button type="button" class="small danger" @click="confirmDeletion(false)" :disabled="!accountPassword || resetting || authLoading || wordSaving || !authUser">{{ t('deleteData') }}</button>
        </div>
        <div class="account-delete-row">
          <p>{{ t('deleteAccountNote') }}</p>
          <button type="button" class="small danger" @click="confirmDeletion(true)" :disabled="!accountPassword || resetting || authLoading || wordSaving || !authUser">{{ t('deleteAccount') }}</button>
        </div>
        <p class="muted">{{ t('deleteLocalNote') }}</p>
        <p v-if="accountError" class="err" role="alert">{{ accountError }}</p>
      </section>
      <p v-if="accountMessage" class="muted" role="status">{{ accountMessage }}</p>
    </div>
  </main>
</template>

<style scoped>
.account-data h3 { overflow-wrap:anywhere; }
.account-password { display:flex; flex-direction:column; gap:6px; font-size:13px; }
.account-password input { min-width:0; font-size:16px; box-sizing:border-box; }
.account-delete-row { display:flex; flex-direction:column; align-items:start; gap:12px; padding:16px 0; }
.account-delete-row + .account-delete-row { border-top:1px solid var(--border); }
.account-delete-row p { font-size:14px; }
.danger { color:light-dark(#b42318, #ffb4ab); border-color:currentColor; min-height:44px; }
.danger:hover { background:var(--fill); border-color:currentColor; }
.danger:disabled { opacity:0.45; cursor:not-allowed; }
</style>
