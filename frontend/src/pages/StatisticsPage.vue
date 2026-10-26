<script setup lang="ts">
import { useSpellingApp } from '../appContext'
import { eligible } from '../learning'
import { accOf, fmtAcc } from '../composables/useStatistics'

const {
  t, locale, chartRange, periodAccuracy, periodCorrect, periodPractice, chartTotal, periodAttempts,
  periodXp, periodIndependent, periodReviews, startLesson, periodPatterns, periodStreak, periodDayStreak,
  mode, board, authUser, boardLoading, chartBars, chartMax, perWordRows, statTree,
  curriculum, periodSkills, mistakeNotebook, practiceSkill, practiceMistake,
} = useSpellingApp()
</script>

<template>
  <main id="center" class="stats-view" :aria-label="t('statistics')">
    <div class="nav period-filter" role="group" :aria-label="t('statistics')">
      <button v-for="range in (['month','week','day'] as const)" :key="range" :class="{active:chartRange===range}" :aria-pressed="chartRange===range" @click="chartRange=range">{{ t(range) }}</button>
    </div>
    <div class="stat-cards period-summary" aria-live="polite">
      <div class="stat-card"><span class="muted">{{ t('accuracy') }}</span><strong>{{ fmtAcc(periodAccuracy) }}</strong><em>{{ periodCorrect }}/{{ periodPractice.length }}✓</em></div>
      <div class="stat-card"><span class="muted">{{ t('attempted') }}</span><strong>{{ periodPractice.length }}</strong><em>{{ t('independent') }}</em></div>
      <div class="stat-card"><span class="muted">{{ t('wordsTyped') }}</span><strong>{{ chartTotal }}</strong><em>{{ t('total') }}</em></div>
      <div class="stat-card"><span class="muted">{{ t('assisted') }}</span><strong>{{ periodAttempts.filter(a=>!eligible(a)).length }}</strong><em>{{ t('total') }}</em></div>
      <div class="stat-card"><span class="muted">{{ t('periodXp') }}</span><strong>{{ periodXp }}</strong><em>{{ t('xp') }}</em></div>
    </div>
    <section class="panel learning-panel statistics-learning">
      <h3>{{ t('independent') }}</h3>
      <div class="retention-cards"><div><strong>{{ fmtAcc(accOf(periodIndependent.length,periodIndependent.filter(a=>a.correct).length)) }}</strong><span>{{ periodIndependent.length }} {{ t('total') }}</span></div><div><strong>{{ periodReviews.filter(r=>Date.parse(r.due)<=Date.now()).length }}</strong><span>{{ t('due') }}</span></div><div><strong>{{ periodReviews.filter(r=>!r.retained).length }}</strong><span>{{ t('learning') }}</span></div><div><strong>{{ periodReviews.filter(r=>r.retained).length }}</strong><span>{{ t('retained') }}</span></div></div>
      <p class="muted">{{ periodAttempts.filter(a=>!eligible(a)).length }} {{ t('assisted') }} · {{ t('recallNote') }}</p>
      <h3>{{ t('skillProgress') }}</h3>
      <p class="muted">{{ t('skillEvidence') }}</p>
      <p v-if="!periodSkills.length" class="muted">{{ t('noSkillEvidence') }}</p>
      <div v-for="skill in periodSkills" :key="skill.skill" class="review-row skill-progress">
        <strong>{{ curriculum.skills.find(s=>s.id===skill.skill)?.name ?? skill.skill }}</strong>
        <span>{{ skill.correct }}/{{ skill.total }} · {{ fmtAcc(accOf(skill.total,skill.correct)) }} · {{ skill.items }} {{ t('examplesTried') }}</span>
        <button class="link" @click="practiceSkill(skill.skill)">{{ t('skillPractice') }}</button>
      </div>
      <h3>{{ t('mistakeNotebook') }} <small>· {{ mistakeNotebook.length }}</small></h3>
      <p class="muted">{{ t('notebookNote') }}</p>
      <p v-if="!mistakeNotebook.length" class="muted">{{ t('noMistakes') }}</p>
      <details v-for="row in mistakeNotebook.slice(0,10)" :key="row.attempt.id" class="notebook-entry">
        <summary><s>{{ row.attempt.submitted }}</s> → <strong>{{ row.attempt.word }}</strong> <small>({{ row.attempt.locale }})</small></summary>
        <p v-if="row.exercise" lang="en">{{ t('exampleContext') }}: {{ row.exercise.prompt }}</p>
        <p v-if="row.exercise" lang="en">{{ row.exercise.explanation }}</p>
        <p v-if="row.exercise" class="contrast-example" lang="en">{{ row.exercise.contrast }}</p>
        <button class="small" @click="practiceMistake(row.attempt)">{{ t('reviewMistake') }}</button>
      </details>
      <h3>{{ t('recentWords') }}</h3>
      <p v-if="!periodReviews.length" class="muted">{{ t('noData') }}</p>
      <div v-for="r in periodReviews.slice(0,10)" :key="r.key" class="review-row"><strong>{{ r.word }} <small>{{ r.locale }}</small></strong><span>{{ r.mistakes }}/{{ r.recent.length }} {{ t('wrongLabel') }} · {{ t('nextReview') }} {{ new Date(r.due).toLocaleDateString(locale) }}</span></div>
      <button class="small" @click="startLesson(true)">{{ t('weakSpots') }}</button>
      <h3>{{ t('patternTitle') }}</h3>
      <p v-if="!periodPatterns.length" class="muted">{{ t('noPatterns') }}</p>
      <div v-for="p in periodPatterns.slice(0,2)" :key="p.key" class="review-row"><strong>{{ p.expected }} → {{ p.typed || '∅' }} · {{ p.position }}</strong><span>{{ p.failures }}/{{ p.opportunities }} {{ t('sample') }} ({{ Math.round(p.rate*100) }}%) · {{ p.words.join(', ') }}</span></div>
      <details v-if="periodAttempts.length"><summary>{{ t('assisted') }} / {{ t('independent') }} · {{ t(chartRange) }}</summary><div v-for="a in periodAttempts.slice(-20).reverse()" :key="a.id" class="review-row"><strong>{{ a.word }} ← {{ a.submitted }} ({{ a.locale }})</strong><span>{{ a.exercise }} · {{ a.assistance }} · {{ new Date(a.date).toLocaleString(locale) }}</span></div></details>
    </section>
    <div class="sidebar statistics-sidebar">
      <p class="muted period-streak">🔥 {{ periodStreak.current }} ({{ t('best') }} {{ periodStreak.best }}) · 📅 {{ periodDayStreak.cur }} {{ t('dayStreak') }} ({{ t('best') }} {{ periodDayStreak.best }})</p>
      <div class="panel statistics-board">
        <h3>{{ t('leaderboard') }} <span class="muted">· {{ t('periodXp') }}</span></h3>
        <p v-if="mode==='guest'" class="muted" style="margin:0 0 8px">{{ t('guestBoardNote') }}</p>
        <ol v-if="board.length" class="board">
          <li v-for="(e, i) in board" :key="e.username" :title="`${e.xp} ${t('xp')}`" :class="{ me: e.username === authUser }"><span>#{{ i + 1 }} {{ e.username }}</span><strong>{{ e.xp }} {{ t('xp') }}</strong></li>
        </ol>
        <p v-else class="muted" style="margin:8px 0 0">{{ boardLoading ? '…' : t('noScores') }}</p>
      </div>
      <!-- Day uses hourly bars; week and month use daily bars. -->
      <div class="panel statistics-chart">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:10px"><h3>{{ t('wordsTyped') }} <span class="muted">· {{ chartRange==='day' ? t('perHour') : t('perDay') }} · {{ chartTotal }}</span></h3></div>
        <div v-if="!chartTotal" class="muted">{{ t('noData') }}</div>
        <div v-else class="bars">
          <div v-for="(b, i) in chartBars" :key="i" class="bar-col" :title="b.title">
            <div class="bar" :style="{ height: (b.value ? Math.max(3, Math.round(b.value / chartMax * 100)) : 0) + '%' }" />
            <span v-if="chartRange==='day' ? i % 3 === 0 : chartBars.length <= 8 || i % Math.ceil(chartBars.length / 8) === 0" class="bar-label">{{ b.label }}</span>
          </div>
        </div>
      </div>
    </div>
    <!-- Per-word list kept at the bottom, collapsed by default. -->
    <details class="panel statistics-words" style="width:100%; padding:0">
      <summary style="padding:12px; font-size:14px; font-weight:700; cursor:pointer">{{ t('wordDetails') }} <span class="muted">· {{ perWordRows.length }}</span></summary>
      <details v-for="(l, li) in statTree" :key="l.key" style="border-top:0.5px solid var(--border)" :open="li===0">
        <summary style="padding:10px 12px 10px 24px; font-size:13px; font-weight:600; cursor:pointer">{{ l.title }} <span class="muted">· {{ l.avg == null ? '—' : l.avg + '%' }} {{ t('avgAcc') }}</span></summary>
        <details v-for="b in l.bands" :key="b.key" style="border-top:0.5px solid var(--border)">
          <summary style="padding:10px 12px 10px 24px; font-size:13px; font-weight:600; cursor:pointer">{{ b.title }} <span class="muted">· {{ b.avg == null ? '—' : b.avg + '%' }} {{ t('avgAcc') }} · {{ b.rows.length }}</span></summary>
          <table class="stat-table">
            <thead><tr><th>{{ t('word') }}</th><th>{{ t('seen') }}</th><th>{{ t('correctH') }}</th><th>{{ t('accuracy') }}</th></tr></thead>
            <tbody>
              <tr v-for="r in b.rows" :key="r.word"><td><strong>{{ r.word }}</strong></td><td>{{ r.seen }}</td><td>{{ r.correct }}</td><td :style="{color: r.acc<60 ? '#ef4444' : r.acc<85 ? '#d97706' : '#16a34a'}">{{ r.seen? r.acc+'%':'—' }}</td></tr>
            </tbody>
          </table>
        </details>
      </details>
      <p v-if="!statTree.length" class="muted" style="text-align:center; padding:12px">{{ t('empty') }}</p>
    </details>
  </main>
</template>
