import { expect, test } from 'bun:test';
import { loadCurriculum, gradeExercise } from './curriculum.ts';

const {skills,exercises}=loadCurriculum();

test('the writing pilot has unique, complete, word-sized exercises and explicit lessons',()=>{
  expect(exercises.length).toBeGreaterThanOrEqual(30);
  expect(new Set(exercises.map(e=>e.exerciseId)).size).toBe(exercises.length);
  expect(new Set(skills.map(s=>s.id)).size).toBe(skills.length);
  for(const skill of skills) {
    expect(skill.rule.length).toBeGreaterThan(30);
    expect(skill.examples).toHaveLength(2);
    expect(exercises.filter(e=>e.skill===skill.id).length).toBeGreaterThanOrEqual(10);
  }
  for(const e of exercises) {
    expect(skills.some(s=>s.id===e.skill)).toBe(true);
    expect(e.locale).toBe('en');
    expect(e.word.length).toBeLessThanOrEqual(50);
    expect(e.word).toMatch(/^[\p{L}’']+$/u);
    expect(e.difficulty).toBeGreaterThanOrEqual(1);
    expect(e.difficulty).toBeLessThanOrEqual(5);
    expect(e.explanation.length).toBeGreaterThan(30);
    expect(e.contrast.length).toBeGreaterThan(20);
    expect(e.hint.length).toBeGreaterThan(10);
    expect(gradeExercise(e,e.word)).toBe(true);
    for(const variant of e.variants??[]) expect(gradeExercise(e,variant)).toBe(true);
    if(e.kind==='correct_word') {
      expect(e.incorrect).toBeTruthy();
      expect(e.prompt).toContain(e.incorrect!);
      expect(gradeExercise(e,e.incorrect!)).toBe(false);
    } else expect(e.prompt).toContain('___');
  }
});

test('exercise grading permits typography and regional spellings without discarding meaningful punctuation or case',()=>{
  const dont=exercises.find(e=>e.word==="don't")!;
  expect(gradeExercise(dont,'  DON’T  ')).toBe(true);
  expect(gradeExercise(dont,'dont')).toBe(false);
  expect(gradeExercise(dont,"don't.")).toBe(false);
  const im=exercises.find(e=>e.word==="I'm")!;
  expect(gradeExercise(im,'I’m')).toBe(true);
  expect(gradeExercise(im,"i'm")).toBe(false);
  const colour=exercises.find(e=>e.word==='colour')!;
  expect(gradeExercise(colour,'color')).toBe(true);
  expect(gradeExercise(colour,'colour')).toBe(true);
  expect(gradeExercise(colour,'colur')).toBe(false);
  expect(gradeExercise(dont,'<script>alert(1)</script>')).toBe(false);
});
