import type { Skill, VocabularyEntryRow, VocabularyExampleRow, VocabularyProgressRow } from "@/lib/db/types";
import { displayLemma } from "./vocabulary";
import { normalize, tokens } from "./text";

/**
 * Builds flashcard exercises. Exercise choice is deterministic (entry, skill,
 * repetition count) so a reload shows the same exercise, while successive
 * reviews rotate through different formats. Voice answers are preferred.
 *
 * Types (numbers refer to the product spec):
 *  1 listen_choose     – hear the Spanish word, choose the meaning   (listening)
 *  7 listen_sentence   – hear a natural sentence, spot the word      (listening)
 *  2 recall_say        – see Polish, say/type the Spanish            (recall)
 *  4 fill_blank        – complete the sentence                       (recall)
 *  5 translate         – translate a short utterance                 (recall)
 *  8 distinguish       – pick the right word among similar ones      (recall)
 *  3 speak_prompt      – "Powiedz po hiszpańsku: …" (voice)          (speaking)
 *  6 own_sentence      – make your own sentence with the word        (speaking)
 */

export type ExerciseType =
  | "listen_choose"
  | "listen_sentence"
  | "recall_say"
  | "fill_blank"
  | "translate"
  | "distinguish"
  | "speak_prompt"
  | "own_sentence";

export interface Exercise {
  key: string;
  entryId: string;
  skill: Skill;
  type: ExerciseType;
  /** What the learner sees (Polish instruction). */
  instruction: string;
  prompt: string | null;
  /** Text to synthesize and play (Spanish). */
  audioText: string | null;
  /** Shown audio-only exercises hide the Spanish text until answered. */
  options: string[] | null;
  exampleIdx: number | null;
  /** Revealed after answering. */
  reveal: { es: string; pl: string; note: string | null };
  inputModes: ("voice" | "text" | "choice")[];
  hint: string | null;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function seeded<T>(arr: T[], seed: number): T[] {
  const a = [...arr];
  let s = seed || 1;
  for (let i = a.length - 1; i > 0; i--) {
    s = Math.imul(s ^ (s >>> 15), 2246822507) >>> 0;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** The surface form of the entry used inside an example sentence (for blanks). */
export function formInSentence(entry: VocabularyEntryRow, sentence: string): string | null {
  const toks = tokens(sentence, true);
  const forms = [entry.lemma, ...entry.forms].map((f) => normalize(f, true));
  for (const t of toks) if (forms.includes(t)) return t;
  if (entry.pos === "v") {
    const stem = normalize(entry.lemma).replace(/(ar|er|ir|arse|erse|irse)$/, "");
    for (const t of toks) if (stem.length >= 3 && normalize(t).startsWith(stem)) return t;
  }
  return null;
}

function blankOut(sentence: string, form: string): string {
  const re = new RegExp(`(^|[^\\p{L}])(${form.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})(?=[^\\p{L}]|$)`, "iu");
  return sentence.replace(re, "$1___");
}

function distractorPool(entry: VocabularyEntryRow, pool: VocabularyEntryRow[]): VocabularyEntryRow[] {
  const samePos = pool.filter((e) => e.id !== entry.id && e.pos === entry.pos && e.kind === entry.kind);
  const near = samePos.filter((e) => Math.abs((e.frequency_rank ?? 500) - (entry.frequency_rank ?? 500)) < 300);
  return near.length >= 6 ? near : samePos.length >= 3 ? samePos : pool.filter((e) => e.id !== entry.id && e.kind === entry.kind);
}

export function buildExercise(
  entry: VocabularyEntryRow,
  examples: VocabularyExampleRow[],
  skill: Skill,
  card: Pick<VocabularyProgressRow, "reps"> | null,
  pool: VocabularyEntryRow[],
  opts: { forceType?: ExerciseType } = {},
): Exercise {
  const reps = card?.reps ?? 0;
  const seed = hash(`${entry.id}:${skill}:${reps}`);
  const ex = examples.length ? examples[seed % examples.length] : null;
  const exampleIdx = ex ? examples.indexOf(ex) : null;
  const shown = displayLemma(entry);
  const meaning = entry.translations.join("; ");
  const formInEx = ex ? formInSentence(entry, ex.es) : null;
  const reveal = { es: ex ? `${shown} — ${ex.es}` : shown, pl: ex ? `${meaning} — ${ex.pl}` : meaning, note: entry.note };
  const distractors = seeded(distractorPool(entry, pool), seed).slice(0, 3);
  const base = { key: `${entry.id}:${skill}:${reps}`, entryId: entry.id, skill, exampleIdx, reveal };

  let type: ExerciseType;
  if (opts.forceType) type = opts.forceType;
  else if (skill === "listening") type = reps >= 2 && ex && formInEx && seed % 2 === 0 ? "listen_sentence" : "listen_choose";
  else if (skill === "recall") {
    const options: ExerciseType[] = ["recall_say"];
    if (reps >= 1 && ex && formInEx) options.push("fill_blank", "distinguish");
    if (reps >= 3 && ex) options.push("translate");
    type = options[seed % options.length];
  } else type = reps >= 2 && seed % 3 === 0 ? "own_sentence" : ex ? "speak_prompt" : "own_sentence";

  switch (type) {
    case "listen_choose":
      return {
        ...base,
        type,
        instruction: "Posłuchaj i wybierz znaczenie.",
        prompt: null,
        audioText: entry.lemma,
        options: seeded([entry.translations[0], ...distractors.map((d) => d.translations[0])], seed + 1),
        inputModes: ["choice"],
        hint: null,
      };
    case "listen_sentence":
      return {
        ...base,
        type,
        instruction: "Posłuchaj zdania. Które z tych słów w nim padło?",
        prompt: null,
        audioText: ex!.es,
        options: seeded([formInEx!, ...distractors.map((d) => d.lemma)], seed + 2),
        inputModes: ["choice"],
        hint: ex!.pl,
      };
    case "recall_say":
      return {
        ...base,
        type,
        instruction: "Powiedz po hiszpańsku:",
        prompt: meaning,
        audioText: null,
        options: null,
        inputModes: ["voice", "text"],
        hint: `${entry.lemma.slice(0, Math.max(1, Math.ceil(entry.lemma.length / 3)))}…`,
      };
    case "fill_blank":
      return {
        ...base,
        type,
        instruction: "Uzupełnij brakujące słowo.",
        prompt: `${blankOut(ex!.es, formInEx!)}\n${ex!.pl}`,
        audioText: null,
        options: null,
        inputModes: ["voice", "text"],
        hint: `${entry.lemma} (${meaning})`,
      };
    case "distinguish":
      return {
        ...base,
        type,
        instruction: "Które słowo pasuje do zdania?",
        prompt: `${blankOut(ex!.es, formInEx!)}\n${ex!.pl}`,
        audioText: null,
        options: seeded([formInEx!, ...distractors.map((d) => d.lemma)], seed + 3),
        inputModes: ["choice"],
        hint: null,
      };
    case "translate":
      return {
        ...base,
        type,
        instruction: "Przetłumacz na hiszpański (głosem lub tekstem):",
        prompt: ex!.pl,
        audioText: null,
        options: null,
        inputModes: ["voice", "text"],
        hint: `Użyj słowa: ${entry.lemma}`,
      };
    case "speak_prompt":
      return {
        ...base,
        type,
        instruction: "Powiedz po hiszpańsku:",
        prompt: ex!.pl,
        audioText: null,
        options: null,
        inputModes: ["voice", "text"],
        hint: `Kluczowe słowo: ${entry.lemma}`,
      };
    case "own_sentence":
      return {
        ...base,
        type,
        instruction: "Ułóż własne zdanie z tym słowem — o sobie, swoim domu, pracy albo planach.",
        prompt: `${shown} — ${meaning}`,
        audioText: null,
        options: null,
        inputModes: ["voice", "text"],
        hint: ex ? `Np.: ${ex.es}` : null,
      };
  }
}

/** Accepted answers for exercises with a single expected Spanish answer. */
export function expectedAnswers(entry: VocabularyEntryRow, examples: VocabularyExampleRow[], ex: Exercise): string[] {
  const example = ex.exampleIdx !== null ? examples[ex.exampleIdx] : null;
  switch (ex.type) {
    case "listen_choose":
      return [entry.translations[0]];
    case "listen_sentence":
    case "distinguish":
    case "fill_blank":
      return [formInSentence(entry, example?.es ?? "") ?? entry.lemma];
    case "recall_say":
      return [entry.lemma, displayLemma(entry), ...entry.lemma.split("/").map((s) => s.trim())];
    case "translate":
    case "speak_prompt":
      return example ? [example.es] : [entry.lemma];
    case "own_sentence":
      return example ? [example.es] : [entry.lemma];
  }
}
