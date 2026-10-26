<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { useSpellingApp } from '../appContext'
import { eligible } from '../learning'
import WordManager from '../components/WordManager.vue'

const {
  t, locale, langName, contentLocale, dueCount, startLesson, displayWords, lesson, manualPractice,
  lessonFirsts, lessonAnswers, lessonNeedsReview, lessonDelayed, lessonTransfer, nextReview,
  drill, weakUnlocked, seenCount, speak, hintText, hintShown, current, covered, retrying,
  onSubmit, input, feedback, resetting, continueWord, submitted, correctionSpans, practiceFocus,
  showList, savedWords, activePackId, packsLoading, packsError, packs, diffLabel, usePack, packApplying,
  curriculum, curriculumLoading, curriculumError, loadCurriculum, currentExercise, spellingExplanation,
  writingPractice, lessonSkill, finishTeaching, practiceSkill,
} = useSpellingApp()
const spellingInput=ref<HTMLInputElement|null>(null)
const lessonButton=ref<HTMLButtonElement|null>(null)
const lessonSummary=ref<HTMLElement|null>(null)
watch([currentExercise, feedback, lessonSkill],async()=>{
  await nextTick()
  if(lessonSkill.value) lessonButton.value?.focus()
  else if(feedback.value==='idle') spellingInput.value?.focus({preventScroll:true})
})
watch(()=>lesson.value?.complete,async complete=>{if(complete){await nextTick();lessonSummary.value?.focus()}})
</script>

<template>
  <main id="center" class="practice-view" :aria-label="t('practice')">
    <div class="practice-workspace">
      <section class="panel learning-panel">
        <div class="lesson-heading"><div><h2>{{ t('dailyLesson') }}</h2><p class="muted">{{ langName(contentLocale) }} · {{ t('lessonNote') }}</p></div><strong>{{ dueCount }} {{ t('due') }}</strong></div>
        <div class="lesson-actions"><button class="small" @click="startLesson()" :disabled="!displayWords.length || !!lesson && !lesson.complete">{{ t('startDaily') }}</button><button class="small secondary" @click="startLesson(true)" :disabled="!displayWords.length || !!lesson && !lesson.complete">{{ t('weakSpots') }}</button><button class="link" @click="manualPractice">{{ t('manual') }}</button></div>
        <p v-if="lesson && !lesson.complete" class="lesson-progress" role="status">{{ lesson.position+1 }} / {{ lesson.items.length }} <button class="link" @click="manualPractice">{{ t('leaveLesson') }}</button></p>
        <p v-if="lesson?.focus && !lesson.complete" class="muted">{{ t('practiceFocus') }}: {{ lesson.focus }} · {{ t('patternNote') }}</p>
      </section>
      <section v-if="lesson?.complete" ref="lessonSummary" class="panel lesson-summary" role="status" tabindex="-1">
        <h2>{{ t('lessonComplete') }}</h2>
        <p>{{ lesson.items.length }} {{ t('answered') }} · {{ lessonFirsts.filter(a=>a.correct).length }}/{{ lessonFirsts.length }} {{ t('recallSummary') }} · {{ lessonAnswers.filter(a=>!eligible(a)).length }} {{ t('studySummary') }}</p>
        <p>{{ t('reviewNeeded') }}: {{ lessonNeedsReview.map(r=>r.word).join(', ') || '—' }}</p>
        <p>{{ locale==='es' ? 'Recuerdo con retraso' : 'Delayed recall' }}: {{ lessonDelayed.map(a=>a.word).join(', ') || '—' }}</p>
        <p>{{ t('firstNewItems') }}: {{ lessonTransfer.map(a=>a.word).join(', ') || '—' }}</p>
        <p>{{ t('nextReview') }}: {{ nextReview ? new Date(nextReview).toLocaleString(locale) : '—' }}</p>
        <button class="small" @click="manualPractice">{{ t('manual') }}</button>
      </section>
      <section v-if="!lesson?.complete" class="panel practice-session">
        <div v-if="!lesson" class="nav" :aria-label="t('mode')">
          <button :class="{active:drill==='correct'}" :aria-pressed="drill==='correct'" @click="writingPractice">{{ t('correctSpelling') }}</button>
          <button :class="{active:drill!=='correct'}" :aria-pressed="drill!=='correct'" @click="drill==='correct' && manualPractice()">{{ t('wordDrills') }}</button>
        </div>
        <div v-if="displayWords.length && !lesson && drill!=='correct'" class="nav" :aria-label="t('wordDrills')">
          <button :class="{active: drill==='seq'}" @click="drill='seq'">{{ t('seqMode') }}</button>
          <button :class="{active: drill==='rand'}" @click="drill='rand'">{{ t('randMode') }}</button>
          <button :class="{active: drill==='weak'}" @click="drill='weak'" :disabled="!weakUnlocked" :title="weakUnlocked ? '' : t('weakLocked')">{{ t('weakMode') }}</button>
          <button :class="{active: drill==='repeat'}" @click="drill='repeat'">{{ t('repeatMode') }}</button>
        </div>
        <p v-if="drill==='correct' && !lesson" class="muted">{{ t('writingIntro') }}</p>
        <p v-if="!weakUnlocked && !lesson && drill!=='correct'" class="muted" style="font-size:13px">{{ t('weakLocked') }} ({{ seenCount }}/{{ displayWords.length }})</p>
        <p v-if="drill==='correct' && curriculumLoading && !displayWords.length" role="status">{{ t('loadingPractice') }}</p>
        <div v-else-if="drill==='correct' && curriculumError" role="alert"><p>{{ curriculumError }}</p><button class="small" @click="loadCurriculum">{{ t('retry') }}</button></div>
        <div v-else-if="!displayWords.length" class="empty"><p>{{ t('noWords') }}</p></div>
        <section v-else-if="lessonSkill" class="micro-lesson" :aria-label="t('microLesson')">
          <p class="eyebrow">{{ t('microLesson') }}</p>
          <h2>{{ lessonSkill.name }}</h2>
          <p>{{ lessonSkill.rule }}</p>
          <ul><li v-for="example in lessonSkill.examples" :key="example">{{ example }}</li></ul>
          <button ref="lessonButton" class="cta" @click="finishTeaching">{{ t('applyRule') }}</button>
        </section>
        <template v-else>
          <div v-if="currentExercise" class="writing-prompt" lang="en">
            <p class="eyebrow">{{ practiceFocus }}</p>
            <p id="exercise-prompt" class="sentence-prompt">{{ currentExercise.prompt }}</p>
            <p v-if="currentExercise.kind==='correct_word'" id="exercise-instruction">{{ t('fixWord') }} <mark>{{ currentExercise.incorrect }}</mark></p>
            <p v-else id="exercise-instruction">{{ t('fillWord') }}</p>
          </div>
          <button v-else class="speak" @click="() => speak()" aria-label="Speak word"><span class="speak-icon">🔊</span> {{ t('listen') }}</button>
          <button v-if="hintText && !hintShown" class="small secondary" @click="hintShown = true">{{ t('showHint') }}</button>
          <p v-if="hintShown && hintText" style="font-size:15px">💡 {{ hintText }}</p>
          <p v-if="hintShown" class="muted" style="font-size:12px; margin-top:-8px">{{ t('hintUsedNote') }}</p>
          <p v-if="drill==='repeat' && current && !covered && !retrying && !lesson" class="repeat-word">{{ current }}</p>
          <template v-if="drill==='repeat' && !lesson && !covered && !retrying"><p class="muted">{{ t('studyNote') }}</p><button class="small" @click="covered=true; input=''">{{ t('cover') }}</button></template>
          <p v-if="retrying" class="muted">{{ t('recallNote') }}</p>
          <form @submit.prevent="onSubmit" class="form">
            <input
              ref="spellingInput"
              v-model="input"
              :placeholder="feedback==='idle' ? t('typeph') : feedback==='correct' ? t('correct') : `${t('was')}: ${current}`"
              :class="['spell', feedback]"
              :readonly="feedback!=='idle'" maxlength="200" aria-label="Your spelling"
              :disabled="resetting"
              :aria-describedby="currentExercise ? 'exercise-prompt exercise-instruction' : undefined"
              autocomplete="off" autocapitalize="off" spellcheck="false"
              @paste="(e) => { if (drill === 'repeat') e.preventDefault() }"
              @keydown.meta.v="(e) => { if (drill === 'repeat') e.preventDefault() }"
              @keydown.ctrl.v="(e) => { if (drill === 'repeat') e.preventDefault() }"
            />
            <button :class="['cta', feedback]" type="submit" :disabled="resetting">{{ feedback==='idle' ? t('check') : feedback==='correct' ? t('next') : t('retry') }}</button>
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
          <section v-if="feedback!=='idle' && spellingExplanation" class="answer-explanation" role="status" lang="en">
            <h3>{{ t('whyCorrect') }}</h3>
            <p>{{ spellingExplanation.explanation }}</p>
            <p class="contrast-example">{{ spellingExplanation.contrast }}</p>
          </section>
        </template>
      </section>
    </div>
    <div class="list-toggle">
      <button class="link" @click="showList = !showList">{{ showList ? t('hide') : t('manage') }} {{ t('wordList') }} ({{ savedWords.length }})</button>
    </div>
    <WordManager v-if="showList" />
    <section class="panel word-packs">
      <template v-if="curriculum.skills.length">
        <h3>{{ t('practiceSkill') }}</h3>
        <p class="muted">{{ t('pilotNote') }}</p>
        <div class="skill-choices"><button v-for="skill in curriculum.skills" :key="skill.id" class="small" @click="practiceSkill(skill.id)" :disabled="!!lesson && !lesson.complete">{{ skill.name }}</button></div>
      </template>
      <h3>{{ t('packs') }}</h3>
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
          <button class="small" @click="usePack(p)" :disabled="packApplying===p.id || activePackId===p.id && !lesson">{{ packApplying===p.id ? t('loadingPack') : t('usePack') }}</button>
        </div>
      </div>
    </section>
  </main>
</template>
