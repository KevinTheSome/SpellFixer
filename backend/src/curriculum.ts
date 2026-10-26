import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

export type WritingExercise = {
  exerciseId: string; locale: string; skill: string; kind: 'correct_word'|'fill_blank';
  word: string; difficulty: number; prompt: string; incorrect?: string; variants?: string[];
  caseSensitive?: boolean; hint: string; explanation: string; contrast: string;
};
export type Curriculum = {
  skills: {id:string; name:string; rule:string; examples:string[]}[];
  exercises: WritingExercise[];
};

export function loadCurriculum(): Curriculum {
  const root = process.env.CONTENT_DIR || join(dirname(fileURLToPath(import.meta.url)), '../content');
  return JSON.parse(readFileSync(join(root, 'en/practice.json'), 'utf8'));
}

export function gradeExercise(exercise: WritingExercise, answer: string) {
  const clean = (s:string) => {
    const text = s.normalize('NFC').trim().replace(/[‘’]/g, "'");
    return exercise.caseSensitive ? text : text.toLowerCase();
  };
  return [exercise.word, ...(exercise.variants ?? [])].some(word => clean(word) === clean(answer));
}
