import { test, expect } from '@playwright/test';
import { align, isCorrect, wordKey, spellingKey, reviews, patterns, mergeAttempts, buildLesson, skillStats, queueLessonRetry, validAnswer, learningBatch, type LearningStore, type Attempt, type LearningWord, type WritingExercise } from '../../frontend/src/learning';
import { loadCurriculum, gradeExercise } from '../../backend/src/curriculum';

test('learning evidence handles edits, reviews, variants, sync and sparse lessons', () => {
  expect(align('market','marked').spans[0]).toMatchObject({expected:'t',typed:'d',position:'end',kind:'substituted'});
  expect(align('necessary','necesary')).toMatchObject({confident:true,spans:[{expected:'ss',typed:'s',kind:'missing'}]});
  expect(align('bell','bel')).toMatchObject({confident:true,spans:[{expected:'ll',typed:'l',position:'end'}]});
  expect(align('friend','freind').spans[0]).toMatchObject({expected:'ie',typed:'ei',kind:'transposed'});
  expect(align('receive','recieve').spans[0]).toMatchObject({expected:'ei',typed:'ie',before:'c',kind:'transposed'});
  expect(align('café','cafe\u0301').distance).toBe(0);
  expect(align('café','cafe').spans[0]).toMatchObject({expected:'é',typed:'e'});
  expect(align('ab','baab').confident).toBe(false);
  expect(align('necessary','unrelated').confident).toBe(false);
  expect(isCorrect({word:'colour',locale:'en',variants:['color']},' COLOR ')).toBe(true);
  expect(wordKey({word:'Gift',locale:'de'})).not.toBe(wordKey({word:'gift',locale:'en'}));
  const attempt=(word:string,submitted:string,date:string,assistance:Attempt['assistance']='none'):Attempt=>({id:crypto.randomUUID(),session:crypto.randomUUID(),word,submitted,locale:'en',date,day:date.slice(0,10),hour:12,assistance,exercise:'practice',standard:'default',correct:word===submitted});
  const history=[attempt('market','marked','2026-01-01T12:00:00Z'),attempt('basket','basked','2026-01-02T12:00:00Z'),attempt('market','marked','2026-01-03T12:00:00Z')];
  expect(patterns([attempt('bell','bel','2026-01-01T12:00:00Z'),attempt('sell','sel','2026-01-02T12:00:00Z'),attempt('bell','bel','2026-01-03T12:00:00Z')])[0]).toMatchObject({expected:'ll',position:'end',failures:3,opportunities:3});
  expect(patterns(history)[0]).toMatchObject({failures:3,opportunities:3,words:['market','basket'],expected:'t',typed:'d'});
  expect(patterns(history.slice(0,2))).toHaveLength(0);
  const assisted=attempt('market','marked','2026-01-04T12:00:00Z','retry');
  expect(patterns([...history,assisted])[0].failures).toBe(3);
  expect(mergeAttempts(history,[...history,assisted])).toHaveLength(4);
  const success=attempt('market','market','2026-01-05T12:00:00Z');
  expect(patterns([...history,success])[0].rate).toBeLessThan(1);
  const recalls=[attempt('friend','friend','2026-01-01T12:00:00Z'),attempt('friend','friend','2026-01-02T12:00:00Z'),attempt('friend','friend','2026-01-05T12:00:00Z')];
  expect(reviews(recalls)[0]).toMatchObject({stage:3,retained:true,due:'2026-01-12T12:00:00.000Z'});
  expect(reviews([recalls[0],attempt('friend','friend','2026-01-01T13:00:00Z')])[0].stage).toBe(1);
  expect(reviews([recalls[0],attempt('friend','friend','2026-01-02T12:00:00Z','copy')])[0].stage).toBe(1);
  expect(reviews([attempt('friend','friend','2026-01-01T12:00:00Z','hint'),attempt('friend','friend','2026-01-01T12:09:00Z','retry')])[0]).toMatchObject({stage:0,due:'2026-01-01T12:10:00.000Z'});
  const lesson=buildLesson(history,[{word:'jacket',locale:'en'},{word:'ticket',locale:'en'}],'en',true,Date.parse('2026-01-06'));
  expect(lesson.map(w=>w.word)).toEqual(['market','basket','jacket','ticket']);
  expect(buildLesson([history[0]],[],'en',true)).toHaveLength(1);
});

test('browser and server agree on every writing exercise and accepted variant',()=>{
  for(const exercise of loadCurriculum().exercises) {
    for(const answer of [exercise.word,...(exercise.variants??[]),exercise.word.toUpperCase(),exercise.word.replaceAll("'",'’'),exercise.incorrect??'wrong',exercise.word+'.','  '+exercise.word+'  ','<b>'+exercise.word+'</b>']) {
      expect(isCorrect(exercise,answer),`${exercise.exerciseId}: ${answer}`).toBe(gradeExercise(exercise,answer));
    }
  }
});

const writingAttempt=(w:LearningWord,date:string,correct=false,assistance:Attempt['assistance']='none'):Attempt=>({...w,id:crypto.randomUUID(),session:crypto.randomUUID(),date,day:date.slice(0,10),hour:12,submitted:correct?w.word:'wrong',correct,assistance,exercise:'daily',standard:'default'});

test('exercise identities separate review evidence while sharing the word-level reward key',()=>{
  const a={word:'their',locale:'en',exerciseId:'their_1',skill:'confusing_words'};
  const b={...a,exerciseId:'their_2'};
  expect(wordKey(a)).not.toBe(wordKey(b));
  expect(spellingKey(a)).toBe(spellingKey(b));
  const history=[writingAttempt(a,'2026-01-01T12:00:00Z',true),writingAttempt(b,'2026-01-02T12:00:00Z')];
  expect(reviews(history).map(r=>r.stage)).toEqual([1,0]);
  expect(skillStats([...history,writingAttempt(a,'2026-01-03T12:00:00Z',true,'hint')],[a,b])[0]).toMatchObject({total:2,correct:1,items:2,mistakes:1});
});

test('daily writing lessons mix skills and keep new targeted examples despite a review backlog',()=>{
  const pool=loadCurriculum().exercises as WritingExercise[];
  const initial=buildLesson([],pool,'en');
  expect(initial).toHaveLength(8);
  expect(new Set(initial.map(e=>e.skill)).size).toBe(3);
  const history=pool.slice(0,10).map(e=>writingAttempt(e,'2026-01-01T12:00:00Z'));
  const lesson=buildLesson(history,pool,'en',true,Date.parse('2026-01-10'));
  const seen=new Set(history.map(wordKey));
  expect(lesson).toHaveLength(8);
  expect(lesson.filter(e=>seen.has(wordKey(e))).length).toBeGreaterThanOrEqual(3);
  expect(lesson.some(e=>!seen.has(wordKey(e)))).toBe(true);
  expect(lesson.some(e=>e.skill==='common_spelling' && !seen.has(wordKey(e)))).toBe(true);
  expect(lesson.every(e=>'prompt' in e)).toBe(true);
});

test('delayed retries preserve every main question, stop at ten and never requeue a retry',()=>{
  const items:(LearningWord & {retry?:boolean})[]=loadCurriculum().exercises.slice(0,8);
  const original=items.map(wordKey);
  queueLessonRetry(items,0);
  expect(wordKey(items[3])).toBe(original[0]);
  expect(items[3].retry).toBe(true);
  queueLessonRetry(items,1);
  queueLessonRetry(items,2);
  expect(items).toHaveLength(10);
  expect(items.filter(e=>!e.retry).map(wordKey)).toEqual(original);
  const sparse:(LearningWord & {retry?:boolean})[]=loadCurriculum().exercises.slice(0,4);
  queueLessonRetry(sparse,0);
  queueLessonRetry(sparse,3);
  expect(sparse.filter(e=>e.retry)).toHaveLength(1);
  queueLessonRetry(sparse,sparse.length-1);
  expect(sparse).toHaveLength(5);
});

test('sync batches preserve oversized historical answers locally without blocking valid progress',()=>{
  expect(validAnswer('a'.repeat(200))).toBe(true);
  expect(validAnswer('a'.repeat(201))).toBe(false);
  expect(validAnswer(' \n ')).toBe(false);
  const make=(submitted:string):Attempt=>({id:crypto.randomUUID(),session:crypto.randomUUID(),word:'friend',locale:'en',submitted,date:'2026-01-01T12:00:00.000Z',day:'2026-01-01',hour:12,exercise:'test',assistance:'none',correct:false,standard:'default'});
  const invalid=make('a'.repeat(201)),valid=make(' '.repeat(201)+'friend');
  const data:LearningStore={attempts:[invalid,valid],pending:[invalid.id,valid.id],tests:[invalid,valid].map(a=>({id:crypto.randomUUID(),owner:'guest',date:a.date,locale:'en',level:'starter',correct:0,total:1,answers:[a]})),pendingTests:[]};
  data.pendingTests=data.tests.map(t=>t.id);
  const batch=learningBatch(data);
  expect(batch.attempts).toEqual([{...valid,submitted:'friend'}]);
  expect(batch.tests.map(t=>t.id)).toEqual([data.tests[1].id]);
  expect(data.attempts).toEqual([invalid,valid]);
  const many=Array.from({length:501},()=>make('friend'));
  const test={...data.tests[1],answers:[many[500]]};
  const large:LearningStore={attempts:many,pending:many.map(a=>a.id),tests:[test],pendingTests:[test.id]};
  expect(learningBatch(large).attempts).toHaveLength(500);
  expect(learningBatch(large).tests).toHaveLength(0);
  large.pending=[many[500].id];
  expect(learningBatch(large).tests).toHaveLength(1);
});
