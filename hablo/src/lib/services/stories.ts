import "server-only";
import type { Session } from "@/lib/session";
import { eq } from "@/lib/db/db";
import type { StoryRow, VocabularyEntryRow } from "@/lib/db/types";
import type { StoryBody } from "@/lib/content/schemas";
import {
  answerHasKeywords,
  basicRetellScore,
  completeStory,
  ensureStarterStories,
  nextVariant,
  pickStoryTargets,
  seedVariant,
  storyBody,
  storyText,
  validateGeneratedStory,
  type StoryVariant,
} from "@/lib/learning/story";
import { getEntries, getProgress, lexiconFor } from "@/lib/learning/vocabulary";
import { findEntries, normalize, tokens } from "@/lib/learning/text";
import { boostCard, competence, recordSpeakingEvidence } from "@/lib/learning/memory";
import { addTask, upsertMemory } from "@/lib/learning/intelligence";
import { applyGrammarResult } from "@/lib/learning/grammar";
import { getPrefs, getProfile, logEvent } from "@/lib/learning/profile";
import { evaluateAnswer, evaluateRetell, generateStory, transformStory, type AiCtx } from "@/lib/ai/tasks";
import { aiProvider } from "@/lib/ai/client";
import { GRAMMAR_TOPIC_IDS } from "@/lib/content/schemas";
import { HttpError } from "@/lib/http-error";

async function ctx(s: Session): Promise<AiCtx> {
  return { db: s.db, userId: s.userId, prefs: await getPrefs(s.db, s.userId) };
}

async function loadStory(s: Session, id: string): Promise<StoryRow> {
  const row = (await s.db.select("stories", { where: [eq("id", id), eq("user_id", s.userId)], limit: 1 }))[0];
  if (!row) throw new HttpError(404, "Nie ma takiej historii.");
  return row;
}

export async function listStories(s: Session) {
  const entries = await getEntries(s.db, s.userId);
  await ensureStarterStories(s.db, s.userId, entries);
  const rows = await s.db.select("stories", { where: [eq("user_id", s.userId)], order: [{ col: "created_at", asc: false }] });
  const now = new Date().toISOString();
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    variant: r.variant,
    source: r.source,
    status: r.status,
    level: r.level,
    tense: r.tense,
    stage: r.stage_reached,
    parentId: r.parent_story_id,
    retellDue: !!r.next_retell_at && r.next_retell_at <= now,
    nextRetellAt: r.next_retell_at,
    createdAt: r.created_at,
  }));
}

async function storeStory(
  s: Session,
  body: StoryBody,
  meta: Pick<StoryRow, "source" | "variant" | "level" | "tense"> & { parentId?: string | null; seedId?: string | null; targets: VocabularyEntryRow[] },
) {
  const [row] = await s.db.insert("stories", {
    user_id: s.userId,
    seed_id: meta.seedId ?? null,
    parent_story_id: meta.parentId ?? null,
    variant: meta.variant,
    source: meta.source,
    title: body.title,
    level: meta.level,
    tense: meta.tense,
    body: { title: body.title, sentences: body.sentences, glossary: body.glossary, questions: body.questions },
    target_entry_ids: meta.targets.map((t) => t.id),
  });
  if (meta.targets.length)
    await s.db.upsert(
      "story_vocabulary",
      meta.targets.map((t) => ({ story_id: row.id, entry_id: t.id, user_id: s.userId, is_target: true })),
    );
  return row;
}

/** New story: AI-generated around the learner's words (validated), or the next starter story. */
export async function createNewStory(s: Session): Promise<{ id: string; generated: boolean; note: string | null }> {
  const [entries, progress] = await Promise.all([getEntries(s.db, s.userId), getProgress(s.db, s.userId)]);
  await ensureStarterStories(s.db, s.userId, entries);
  if (aiProvider()) {
    const c = await ctx(s);
    const profile = await getProfile(s.db, s.userId);
    const targets = pickStoryTargets(entries, progress);
    const byId = new Map(entries.map((e) => [e.id, e]));
    const known = progress
      .filter((p) => p.skill === "recall" && competence(p) !== "none")
      .map((p) => byId.get(p.entry_id)?.lemma)
      .filter((x): x is string => !!x);
    const knownLemmas = [...new Set([...known, ...entries.filter((e) => (e.frequency_rank ?? 9999) <= 120).map((e) => e.lemma)])].slice(0, 250);
    const existing = await s.db.select("stories", { where: [eq("user_id", s.userId)] });
    const level = profile?.start_level === "intermediate" || profile?.start_level === "advanced" ? 2 : 1;
    const lex = lexiconFor(entries);
    for (let attempt = 0; attempt < 2; attempt++) {
      const out = await generateStory(c, {
        level,
        tense: progress.length > 150 && attempt === 0 ? "mixed" : "present",
        target_words: targets.map((t) => ({ lemma: t.lemma, pl: t.translations[0] })),
        known_lemmas: knownLemmas,
        interests: c.prefs?.interests ?? [],
        avoid_titles: existing.map((e) => e.title).slice(0, 30),
      });
      if (!out) break;
      const v = validateGeneratedStory(out, targets, lex);
      if (v.ok || attempt === 1) {
        const used = targets.filter((t) => !v.missingTargets.includes(t.lemma));
        const row = await storeStory(s, out, { source: "ai", variant: "original", level, tense: "present", targets: used });
        return { id: row.id, generated: true, note: v.ok ? null : `Historia nie zawiera słów: ${v.missingTargets.join(", ")}.` };
      }
    }
  }
  const next = (
    await s.db.select("stories", {
      where: [eq("user_id", s.userId), eq("status", "new"), eq("variant", "original")],
      order: [{ col: "created_at" }],
      limit: 1,
    })
  )[0];
  if (!next) throw new HttpError(409, "Wszystkie historie startowe są przerobione. Skonfiguruj Claude API, aby generować nowe.");
  return { id: next.id, generated: false, note: aiProvider() ? null : "Bez klucza AI korzystasz z biblioteki gotowych historii." };
}

/** Story with a tap-to-translate dictionary for every token. */
export async function getStoryView(s: Session, id: string) {
  const row = await loadStory(s, id);
  const body = storyBody(row);
  const entries = await getEntries(s.db, s.userId);
  const lex = lexiconFor(entries);
  const byId = new Map(entries.map((e) => [e.id, e]));
  const gloss: Record<string, { lemma: string; pl: string; entryId: string | null; isNew: boolean }> = {};
  for (const g of body.glossary) gloss[normalize(g.form)] = { lemma: g.lemma, pl: g.pl, entryId: null, isNew: g.is_new };
  for (const sent of body.sentences) {
    for (const t of tokens(sent.es)) {
      if (gloss[t]) continue;
      const found = findEntries(t, lex);
      const first = [...found.keys()][0];
      const e = first ? byId.get(first) : null;
      if (e) gloss[t] = { lemma: e.lemma, pl: e.translations.slice(0, 2).join(", "), entryId: e.id, isNew: false };
    }
  }
  const targets = row.target_entry_ids.map((tid) => byId.get(tid)).filter((e): e is VocabularyEntryRow => !!e);
  const attempts = await s.db.select("story_attempts", { where: [eq("story_id", id)], order: [{ col: "created_at" }] });
  const parent = row.parent_story_id ? (await s.db.select("stories", { where: [eq("id", row.parent_story_id)], limit: 1 }))[0] : null;
  return {
    id: row.id,
    title: row.title,
    variant: row.variant,
    tense: row.tense,
    status: row.status,
    stage: row.stage_reached,
    source: row.source,
    body,
    gloss,
    parentTitle: parent?.title ?? null,
    targets: targets.map((t) => ({ id: t.id, lemma: t.lemma, pl: t.translations[0] })),
    attempts: attempts.filter((a) => a.kind !== "lookup").map((a) => ({ kind: a.kind, score: a.score, result: a.result, createdAt: a.created_at })),
  };
}

export async function setStage(s: Session, id: string, stage: number) {
  const row = await loadStory(s, id);
  await s.db.update("stories", [eq("id", id)], {
    stage_reached: Math.max(row.stage_reached, Math.min(6, stage)),
    status: row.status === "completed" ? "completed" : "in_progress",
  });
}

/** Tapping a word = it was not recognized: bring its card forward (not a failed review). */
export async function lookupWord(s: Session, id: string, form: string, entryId: string | null) {
  await loadStory(s, id);
  await s.db.insert("story_attempts", { user_id: s.userId, story_id: id, kind: "lookup", input_text: form.slice(0, 60), result: { entryId } });
  if (entryId) {
    await boostCard(s.db, s.userId, entryId, "listening");
    await boostCard(s.db, s.userId, entryId, "recall");
  }
}

export async function answerQuestions(s: Session, id: string, answers: string[], inputMode: "voice" | "text") {
  const row = await loadStory(s, id);
  const body = storyBody(row);
  const c = await ctx(s);
  const results: { correct: boolean; expected: string; feedback: string | null }[] = [];
  for (let i = 0; i < body.questions.length; i++) {
    const q = body.questions[i];
    const a = answers[i] ?? "";
    let correct = answerHasKeywords(a, q.keywords);
    let feedback: string | null = null;
    if (!correct && a.trim() && aiProvider()) {
      const ev = await evaluateAnswer(c, {
        task_pl: `Odpowiedz na pytanie do historii: ${q.q_es}`,
        learner_answer: a,
        reference_answers: [q.answer_es],
        target_lemma: null,
        construction: null,
        input_mode: inputMode,
      });
      if (ev) {
        correct = ev.meaning_ok;
        feedback = ev.explanation_pl;
      }
    }
    results.push({ correct, expected: q.answer_es, feedback });
  }
  const score = results.filter((r) => r.correct).length / Math.max(1, results.length);
  await s.db.insert("story_attempts", { user_id: s.userId, story_id: id, kind: "questions", input_text: answers.join("\n"), result: { results }, score });
  await setStage(s, id, 4);
  await logEvent(s.db, s.userId, "story", { minutes: 2, payload: { story_id: id, stage: "questions" } });
  return { results, score };
}

export async function evaluateTelling(
  s: Session,
  id: string,
  text: string,
  mode: "retell" | "own_story",
  inputMode: "voice" | "text",
) {
  const row = await loadStory(s, id);
  const body = storyBody(row);
  const entries = await getEntries(s.db, s.userId);
  const byId = new Map(entries.map((e) => [e.id, e]));
  const targets = row.target_entry_ids.map((t) => byId.get(t)).filter((e): e is VocabularyEntryRow => !!e);
  const lex = lexiconFor(entries);
  const c = await ctx(s);
  const ai = await evaluateRetell(c, {
    mode,
    story_es: storyText(body),
    target_lemmas: targets.map((t) => t.lemma),
    learner_text: text,
    input_mode: inputMode,
  });
  const basic = basicRetellScore(text, targets, lex);
  const result = ai
    ? { ...ai, approximate: false, evaluator: aiProvider() === "mock" ? "test" : "ai" }
    : {
        summary_pl: `Użyłeś ${basic.used.length} z ${targets.length} słów docelowych (${basic.words} słów łącznie). Bez modelu AI nie oceniam gramatyki ani spójności — to ocena przybliżona.`,
        score: basic.score,
        covered_events: 0,
        total_events: 0,
        used_target_lemmas: basic.used,
        missing_target_lemmas: basic.missing,
        mistakes: [],
        strengths_pl: basic.used.length ? [`Słowa użyte poprawnie w kontekście: ${basic.used.join(", ")}.`] : [],
        approximate: true,
        evaluator: "rules",
      };

  await s.db.insert("story_attempts", { user_id: s.userId, story_id: id, kind: mode, input_text: text.slice(0, 4000), result, score: result.score });

  // Words that were missing come back in reviews; words used in an own story count as spontaneous speech.
  const missingIds = targets.filter((t) => result.missing_target_lemmas.map((l) => normalize(l)).includes(normalize(t.lemma))).map((t) => t.id);
  for (const mid of missingIds) await boostCard(s.db, s.userId, mid, "recall");
  if (missingIds.length) {
    await addTask(s.db, s.userId, { type: "review_words", goal: "Słowa, których zabrakło w opowiadaniu historii", source: "story", entry_ids: missingIds, priority: 60 });
  }
  const found = findEntries(text, lex);
  for (const t of targets) {
    if (!found.has(t.id)) continue;
    await recordSpeakingEvidence(s.db, s.userId, {
      entryId: t.id,
      spontaneous: mode === "own_story",
      echoed: mode === "retell", // just heard in the story: exposure, not independent production
      assisted: false,
      utterance: text,
    });
  }
  const validTopics = new Set<string>(GRAMMAR_TOPIC_IDS);
  for (const m of result.mistakes) {
    await upsertMemory(s.db, s.userId, "error_pattern", m.grammar_topic_id ?? m.category, `${m.original} → ${m.corrected} (${m.explanation_pl})`);
    if (m.grammar_topic_id && validTopics.has(m.grammar_topic_id))
      await applyGrammarResult(s.db, s.userId, { topicId: m.grammar_topic_id, correct: false, score: 0, source: "conversation" });
  }
  await setStage(s, id, mode === "retell" ? 5 : 6);
  await logEvent(s.db, s.userId, "story", { minutes: 3, payload: { story_id: id, stage: mode } });
  return result;
}

export async function finishStory(s: Session, id: string) {
  const row = await loadStory(s, id);
  await completeStory(s.db, row);
  return { ok: true };
}

/** Recurring stories: create the next modified version (past, extended, perspective, future). */
export async function createVariant(s: Session, id: string) {
  const row = await loadStory(s, id);
  const root = row.parent_story_id ? await loadStory(s, row.parent_story_id) : row;
  const variant: StoryVariant = nextVariant(root.retell_count);
  const entries = await getEntries(s.db, s.userId);
  const byId = new Map(entries.map((e) => [e.id, e]));
  const targets = root.target_entry_ids.map((t) => byId.get(t)).filter((e): e is VocabularyEntryRow => !!e);
  const existing = (
    await s.db.select("stories", { where: [eq("user_id", s.userId), eq("parent_story_id", root.id), eq("variant", variant)], limit: 1 })
  )[0];
  if (existing) return { id: existing.id, variant, generated: false };
  const seeded = seedVariant(root.seed_id, variant);
  if (seeded) {
    const r = await storeStory(s, seeded, { source: "seed", variant, level: root.level, tense: seeded.tense, parentId: root.id, targets });
    return { id: r.id, variant, generated: false };
  }
  const out = await transformStory(await ctx(s), { variant, story: storyBody(root), level: root.level });
  if (!out) {
    // No AI and no hand-written variant: retell the same story with a different instruction.
    return { id: root.id, variant: "original", generated: false, note: "Brak gotowej wersji — opowiedz historię w czasie przeszłym." };
  }
  const r = await storeStory(s, out, {
    source: "ai",
    variant,
    level: root.level,
    tense: variant === "past" ? "past" : variant === "future" ? "future" : root.tense,
    parentId: root.id,
    targets,
  });
  return { id: r.id, variant, generated: true };
}
