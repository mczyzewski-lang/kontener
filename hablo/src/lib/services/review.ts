import "server-only";
import { createEmptyCard, State } from "ts-fsrs";
import type { Session } from "@/lib/session";
import { eq, inList } from "@/lib/db/db";
import type { Skill, VocabularyEntryRow, VocabularyExampleRow, VocabularyProgressRow } from "@/lib/db/types";
import { buildExercise, expectedAnswers, type Exercise, type ExerciseType } from "@/lib/learning/exercises";
import { getDueCards, getCard, recordReview } from "@/lib/learning/memory";
import { displayLemma, getEntries, getExamples, getProgress, lexiconFor, POS_LABEL, selectNewEntries } from "@/lib/learning/vocabulary";
import { findEntries, matchSentence, matchShort, normalize } from "@/lib/learning/text";
import { getPrefs, logEvent } from "@/lib/learning/profile";
import { evaluateAnswer } from "@/lib/ai/tasks";
import { aiProvider } from "@/lib/ai/client";
import { HttpError } from "@/lib/http-error";

export interface EntryDto {
  id: string;
  kind: "word" | "phrase";
  lemma: string;
  display: string;
  pos: string;
  posLabel: string;
  translations: string[];
  examples: { es: string; pl: string }[];
  collocations: string[];
  forms: string[];
  note: string | null;
  rank: number | null;
  level: number;
  topics: string[];
}

export function toDto(e: VocabularyEntryRow, examples: VocabularyExampleRow[] = []): EntryDto {
  return {
    id: e.id,
    kind: e.kind,
    lemma: e.lemma,
    display: displayLemma(e),
    pos: e.pos,
    posLabel: POS_LABEL[e.pos] ?? e.pos,
    translations: e.translations,
    examples: examples.map((x) => ({ es: x.es, pl: x.pl })),
    collocations: e.collocations,
    forms: e.forms,
    note: e.note,
    rank: e.frequency_rank,
    level: e.level,
    topics: e.topics,
  };
}

export interface QueueItem {
  exercise: Exercise;
  entry: EntryDto;
  isNew: boolean;
}

export async function buildQueue(
  s: Session,
  opts: { mode: "review" | "new" | "practice"; entryIds?: string[]; limit?: number },
): Promise<QueueItem[]> {
  const [entries, progress] = await Promise.all([getEntries(s.db, s.userId), getProgress(s.db, s.userId)]);
  const byId = new Map(entries.map((e) => [e.id, e]));
  const card = new Map(progress.map((p) => [`${p.entry_id}:${p.skill}`, p]));
  const limit = opts.limit ?? 40;
  const items: { entry: VocabularyEntryRow; skill: Skill; isNew: boolean; forceType?: ExerciseType }[] = [];

  if (opts.mode === "new") {
    // Resumable: an entry is finished once it has a recall card; a half-done entry only gets the missing step.
    let ids = (opts.entryIds ?? []).filter((id) => byId.has(id) && !card.has(`${id}:recall`));
    if (!opts.entryIds) ids = selectNewEntries(entries, progress, Math.min(limit, 5));
    for (const id of ids.slice(0, limit)) {
      const fresh = !card.has(`${id}:listening`);
      if (fresh) items.push({ entry: byId.get(id)!, skill: "listening", isNew: true, forceType: "listen_choose" });
      items.push({ entry: byId.get(id)!, skill: "recall", isNew: fresh, forceType: "recall_say" });
    }
  } else {
    const due = await getDueCards(s.db, s.userId, new Date(), limit);
    const urgent = (opts.entryIds ?? [])
      .filter((id) => byId.has(id))
      .map((id) => card.get(`${id}:recall`))
      .filter((c): c is VocabularyProgressRow => !!c && !due.includes(c));
    let cards = [...urgent, ...due];
    if (opts.mode === "practice" && cards.length < 10) {
      // Extra practice with the weakest cards; not-due cards are not rescheduled on success.
      const extra = progress
        .filter((p) => !cards.includes(p) && p.state !== State.New)
        .sort((a, b) => a.stability - b.stability)
        .slice(0, 10 - cards.length);
      cards = [...cards, ...extra];
    }
    // Interleave skills and avoid the same word twice in a row.
    for (const c of cards.slice(0, limit)) {
      const e = byId.get(c.entry_id);
      if (e) items.push({ entry: e, skill: c.skill, isNew: false });
    }
  }
  const examples = await getExamples(s.db, [...new Set(items.map((i) => i.entry.id))]);
  const pool = entries.filter((e) => e.kind === "word" || e.kind === "phrase");
  return items.map((i) => ({
    isNew: i.isNew,
    entry: toDto(i.entry, examples.get(i.entry.id) ?? []),
    exercise: buildExercise(i.entry, examples.get(i.entry.id) ?? [], i.skill, card.get(`${i.entry.id}:${i.skill}`) ?? null, pool, {
      forceType: i.forceType,
    }),
  }));
}

export interface AnswerInput {
  entryId: string;
  skill: Skill;
  type: ExerciseType;
  exampleIdx: number | null;
  response: string;
  inputMode: "voice" | "text" | "choice";
  latencyMs: number | null;
  assisted: boolean;
  source: "flashcard" | "new_words" | "manual";
}

export interface AnswerResult {
  verdict: "correct" | "minor" | "incorrect";
  correct: boolean;
  expected: string;
  corrected: string | null;
  explanation: string | null;
  approximate: boolean;
  evaluator: "exact" | "ai" | "rules" | "test";
}

export async function submitAnswer(s: Session, a: AnswerInput): Promise<AnswerResult> {
  const entry = (await s.db.select("vocabulary_entries", { where: [eq("id", a.entryId)], limit: 1 }))[0];
  if (!entry || (entry.owner_id && entry.owner_id !== s.userId)) throw new HttpError(404, "Nie ma takiego słowa.");
  const examples = (await getExamples(s.db, [entry.id])).get(entry.id) ?? [];
  const expected = expectedAnswers(entry, examples, { type: a.type, exampleIdx: a.exampleIdx } as Exercise);
  const prefs = await getPrefs(s.db, s.userId);
  let result: AnswerResult;

  if (a.type === "listen_choose" || a.type === "listen_sentence" || a.type === "distinguish") {
    const correct = normalize(a.response, true) === normalize(expected[0], true);
    result = { verdict: correct ? "correct" : "incorrect", correct, expected: expected[0], corrected: null, explanation: null, approximate: false, evaluator: "exact" };
  } else if (a.type === "recall_say" || a.type === "fill_blank") {
    const m = matchShort(a.response, expected);
    // Spoken answers come through speech recognition: accent marks are not the learner's error.
    const verdict = a.inputMode === "voice" && m.verdict === "minor" && m.note?.includes("akcent") ? "correct" : m.verdict;
    result = {
      verdict,
      correct: verdict !== "incorrect",
      expected: expected[0],
      corrected: verdict === "correct" ? null : m.best,
      explanation: verdict === "correct" ? null : m.note,
      approximate: false,
      evaluator: "exact",
    };
    // A full sentence containing the word is also a valid spoken answer to "say X".
    if (!result.correct && a.type === "recall_say" && a.response.trim().split(/\s+/).length > 1) {
      const found = findEntries(a.response, lexiconFor(await getEntries(s.db, s.userId)));
      if (found.has(entry.id)) result = { ...result, verdict: "minor", correct: true, explanation: "Użyłeś słowa w zdaniu — dobrze." };
    }
  } else {
    const ai = await evaluateAnswer(
      { db: s.db, userId: s.userId, prefs },
      {
        task_pl:
          a.type === "own_sentence"
            ? `Ułóż własne, sensowne zdanie ze słowem „${entry.lemma}” (${entry.translations[0]}).`
            : `Powiedz po hiszpańsku: ${examples[a.exampleIdx ?? 0]?.pl ?? entry.translations[0]}`,
        learner_answer: a.response,
        reference_answers: expected,
        target_lemma: entry.lemma,
        construction: null,
        input_mode: a.inputMode === "voice" ? "voice" : "text",
      },
    );
    if (ai) {
      const verdict = ai.used_target || a.type !== "own_sentence" ? ai.verdict : "incorrect";
      result = {
        verdict,
        correct: verdict !== "incorrect",
        expected: expected[0],
        corrected: ai.corrected,
        explanation: ai.used_target ? ai.explanation_pl : `Zdanie powinno zawierać słowo „${entry.lemma}”. ${ai.explanation_pl}`,
        approximate: false,
        evaluator: aiProvider() === "mock" ? "test" : "ai",
      };
    } else if (a.type === "own_sentence") {
      const found = findEntries(a.response, lexiconFor(await getEntries(s.db, s.userId)));
      const words = a.response.trim().split(/\s+/).length;
      const ok = found.has(entry.id) && words >= 4;
      result = {
        verdict: ok ? "minor" : "incorrect",
        correct: ok,
        expected: expected[0],
        corrected: null,
        explanation: ok
          ? "Zdanie zawiera słowo. Bez modelu AI nie oceniam gramatyki — to ocena przybliżona."
          : `Zdanie powinno mieć co najmniej 4 słowa i zawierać „${entry.lemma}”.`,
        approximate: true,
        evaluator: "rules",
      };
    } else {
      const m = matchSentence(a.response, expected, [entry.lemma, ...entry.forms]);
      result = {
        verdict: m.verdict,
        correct: m.verdict !== "incorrect",
        expected: expected[0],
        corrected: m.verdict === "correct" ? null : m.best,
        explanation: m.note,
        approximate: true,
        evaluator: "rules",
      };
    }
  }

  const before = await getCard(s.db, s.userId, entry.id, a.skill);
  const after = await recordReview(s.db, s.userId, {
    entryId: entry.id,
    skill: a.skill,
    exerciseType: a.type,
    source: a.source,
    correct: result.correct,
    minorIssue: result.verdict === "minor",
    assisted: a.assisted,
    latencyMs: a.latencyMs,
    response: a.response.slice(0, 500),
    forceSchedule: a.source === "new_words" && !before,
  });
  // Once active recall graduates, the separate speaking skill enters the program.
  if (a.skill === "recall" && after.state === State.Review) {
    const speaking = await getCard(s.db, s.userId, entry.id, "speaking");
    if (!speaking) {
      const c = createEmptyCard(new Date(Date.now() + 86_400_000));
      await s.db.upsert("vocabulary_progress", {
        user_id: s.userId,
        entry_id: entry.id,
        skill: "speaking",
        due: c.due.toISOString(),
        state: 0,
      });
    }
  }
  await logEvent(s.db, s.userId, a.source === "new_words" ? "new_word" : "review", {
    minutes: Math.min(2, (a.latencyMs ?? 15_000) / 60_000 + 0.15),
    payload: { entry_id: entry.id, skill: a.skill, correct: result.correct },
  });
  return result;
}

/** Entry ids that already have any progress (used to filter "new" lists client-side). */
export async function progressFor(s: Session, entryIds: string[]) {
  if (!entryIds.length) return [];
  return s.db.select("vocabulary_progress", { where: [eq("user_id", s.userId), inList("entry_id", entryIds)] });
}
