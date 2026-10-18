import { createEmptyCard, fsrs, generatorParameters, Rating, State, type Card, type Grade } from "ts-fsrs";
import type { Db } from "@/lib/db/db";
import { eq, inList, lte } from "@/lib/db/db";
import type { ReviewSource, Skill, VocabularyProgressRow } from "@/lib/db/types";

/**
 * Memory Engine — FSRS spaced repetition with three independent cards per
 * entry: listening recognition, active recall and speaking usage.
 *
 * Integrity rules (what counts as a real review):
 *  - A wrong answer always counts (it is real evidence of forgetting).
 *  - A correct answer with a visible hint/repeat counts as "Hard" for
 *    listening/recall and does NOT schedule the speaking card at all.
 *  - Seeing a word that is not due (e.g. inside a story) is logged but does not
 *    reschedule the card, so incidental exposure cannot inflate progress.
 *  - Conversation usage only counts when it was spontaneous: not echoed from
 *    the tutor's previous turn and not produced right after a hint.
 */

let fuzzEnabled = true;
export function setFuzzForTests(enabled: boolean) {
  fuzzEnabled = enabled;
}

function scheduler() {
  return fsrs(
    generatorParameters({
      request_retention: 0.9,
      maximum_interval: 365,
      enable_fuzz: fuzzEnabled,
      enable_short_term: true,
    }),
  );
}

export function rowToCard(row: VocabularyProgressRow): Card {
  return {
    due: new Date(row.due),
    stability: row.stability,
    difficulty: row.difficulty,
    elapsed_days: row.elapsed_days,
    scheduled_days: row.scheduled_days,
    learning_steps: row.learning_steps,
    reps: row.reps,
    lapses: row.lapses,
    state: row.state as State,
    last_review: row.last_review ? new Date(row.last_review) : undefined,
  };
}

function cardToPatch(card: Card): Partial<VocabularyProgressRow> {
  return {
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.last_review ? card.last_review.toISOString() : null,
  };
}

export interface Outcome {
  correct: boolean;
  assisted?: boolean;
  /** Small issue (missing accent, typo, minor grammar slip) — still correct. */
  minorIssue?: boolean;
  latencyMs?: number | null;
}

export function ratingFor(o: Outcome, state: State): Grade {
  if (!o.correct) return Rating.Again;
  if (o.assisted || o.minorIssue) return Rating.Hard;
  if (o.latencyMs && o.latencyMs > 15_000) return Rating.Hard;
  if (state === State.Review && o.latencyMs && o.latencyMs < 2_500) return Rating.Easy;
  return Rating.Good;
}

export interface ReviewInput extends Outcome {
  entryId: string;
  skill: Skill;
  exerciseType: string;
  source: ReviewSource;
  response?: string | null;
  now?: Date;
  /** Force scheduling even if the card is not due (explicit flashcard practice). */
  forceSchedule?: boolean;
}

const pk = (userId: string, entryId: string, skill: Skill) => [
  eq("user_id", userId),
  eq("entry_id", entryId),
  eq("skill", skill),
];

export async function getCard(db: Db, userId: string, entryId: string, skill: Skill) {
  const rows = await db.select("vocabulary_progress", { where: pk(userId, entryId, skill), limit: 1 });
  return rows[0] ?? null;
}

/** Records one exercise attempt and (when the integrity rules allow) reschedules the card. */
export async function recordReview(db: Db, userId: string, input: ReviewInput): Promise<VocabularyProgressRow> {
  const now = input.now ?? new Date();
  const existing = await getCard(db, userId, input.entryId, input.skill);
  const card = existing ? rowToCard(existing) : createEmptyCard(now);
  const isDue = !existing || card.state !== State.Review || card.due.getTime() <= now.getTime();
  const speakingAssisted = input.skill === "speaking" && input.assisted && input.correct;
  const scheduled = !speakingAssisted && (isDue || !input.correct || !!input.forceSchedule);
  const grade = ratingFor(input, card.state);

  let patch: Partial<VocabularyProgressRow> = {};
  if (scheduled) {
    const next = scheduler().next(card, now, grade).card;
    patch = cardToPatch(next);
  }
  const row: Partial<VocabularyProgressRow> = {
    user_id: userId,
    entry_id: input.entryId,
    skill: input.skill,
    ...(existing ? {} : { ...cardToPatch(card), first_seen_at: now.toISOString() }),
    ...patch,
    correct_count: (existing?.correct_count ?? 0) + (input.correct ? 1 : 0),
    incorrect_count: (existing?.incorrect_count ?? 0) + (input.correct ? 0 : 1),
    assisted_count: (existing?.assisted_count ?? 0) + (input.assisted ? 1 : 0),
    priority_boost: input.correct ? 0 : Math.min(3, (existing?.priority_boost ?? 0) + 1),
    known_claimed: input.correct ? (existing?.known_claimed ?? false) : false,
    updated_at: now.toISOString(),
  };
  const [saved] = await db.upsert("vocabulary_progress", row);
  await db.insert("vocabulary_review_logs", {
    user_id: userId,
    entry_id: input.entryId,
    skill: input.skill,
    exercise_type: input.exerciseType,
    source: input.source,
    rating: scheduled ? grade : null,
    correct: input.correct,
    assisted: !!input.assisted,
    scheduled,
    response: input.response ?? null,
    latency_ms: input.latencyMs ?? null,
    state_before: existing?.state ?? null,
    due_before: existing?.due ?? null,
    reviewed_at: now.toISOString(),
  });
  return saved;
}

export interface SpeakingEvidence {
  entryId: string;
  spontaneous: boolean;
  assisted: boolean;
  echoed: boolean;
  utterance: string;
  now?: Date;
}

/** Usage of a word inside a conversation. Only spontaneous, unassisted use moves the speaking card. */
export async function recordSpeakingEvidence(db: Db, userId: string, ev: SpeakingEvidence) {
  const now = ev.now ?? new Date();
  const genuine = ev.spontaneous && !ev.assisted && !ev.echoed;
  const existing = await getCard(db, userId, ev.entryId, "speaking");
  let patch: Partial<VocabularyProgressRow> = {};
  let scheduled = false;
  if (genuine) {
    const card = existing ? rowToCard(existing) : createEmptyCard(now);
    const isDue = !existing || card.state !== State.Review || card.due.getTime() <= now.getTime();
    if (isDue) {
      patch = cardToPatch(scheduler().next(card, now, Rating.Good).card);
      scheduled = true;
    } else if (!existing) {
      patch = cardToPatch(card);
    }
  } else if (!existing) {
    // Not genuine evidence; nothing to schedule and no card to create.
    await logOnly();
    return null;
  }
  const [saved] = await db.upsert("vocabulary_progress", {
    user_id: userId,
    entry_id: ev.entryId,
    skill: "speaking",
    ...patch,
    spontaneous_uses: (existing?.spontaneous_uses ?? 0) + (genuine ? 1 : 0),
    last_spontaneous_use_at: genuine ? now.toISOString() : (existing?.last_spontaneous_use_at ?? null),
    assisted_count: (existing?.assisted_count ?? 0) + (ev.assisted ? 1 : 0),
    updated_at: now.toISOString(),
  });
  await logOnly(scheduled);
  return saved;

  async function logOnly(sched = false) {
    await db.insert("vocabulary_review_logs", {
      user_id: userId,
      entry_id: ev.entryId,
      skill: "speaking",
      exercise_type: ev.echoed ? "conversation_echo" : ev.assisted ? "conversation_assisted" : "conversation_use",
      source: "conversation",
      rating: sched ? Rating.Good : null,
      correct: true,
      assisted: ev.assisted,
      scheduled: sched,
      response: ev.utterance.slice(0, 500),
      reviewed_at: now.toISOString(),
    });
  }
}

/**
 * A word the learner needed but could not produce (asked "¿cómo se dice…?",
 * switched to Polish, or the analysis flagged it). Real forgetting evidence:
 * known recall cards lapse, unknown words enter the queue with high priority.
 */
export async function recordMissingWord(db: Db, userId: string, entryId: string, source: ReviewSource, now = new Date()) {
  const existing = await getCard(db, userId, entryId, "recall");
  if (existing && existing.state !== State.New) {
    return recordReview(db, userId, {
      entryId,
      skill: "recall",
      exerciseType: "missing_in_" + source,
      source,
      correct: false,
      now,
      forceSchedule: true,
    });
  }
  const card = existing ? rowToCard(existing) : createEmptyCard(now);
  const [saved] = await db.upsert("vocabulary_progress", {
    user_id: userId,
    entry_id: entryId,
    skill: "recall",
    ...cardToPatch(card),
    due: now.toISOString(),
    priority_boost: 3,
    updated_at: now.toISOString(),
  });
  return saved;
}

/** Pulls a card forward (e.g. a word looked up in a story) without counting a failed review. */
export async function boostCard(db: Db, userId: string, entryId: string, skill: Skill, now = new Date()) {
  const existing = await getCard(db, userId, entryId, skill);
  if (!existing) return null;
  const sooner = new Date(Math.min(new Date(existing.due).getTime(), now.getTime() + 24 * 3_600_000));
  const [saved] = await db.update("vocabulary_progress", pk(userId, entryId, skill), {
    due: sooner.toISOString(),
    priority_boost: Math.min(3, existing.priority_boost + 1),
    updated_at: now.toISOString(),
  });
  return saved;
}

/**
 * Marks entries as already known (onboarding placement or manual "I know this").
 * Knowledge is NOT taken on trust: listening and recall cards are created as if
 * answered "Easy" once, flagged known_claimed, and spread over the next days so
 * each claim is verified by a real review without flooding the queue.
 */
export async function claimKnown(
  db: Db,
  userId: string,
  entryIds: string[],
  opts: { now?: Date; spreadDays?: number } = {},
) {
  const now = opts.now ?? new Date();
  const spread = Math.max(1, opts.spreadDays ?? 14);
  const existing = await db.select("vocabulary_progress", {
    where: [eq("user_id", userId), inList("entry_id", entryIds)],
  });
  const have = new Set(existing.map((r) => `${r.entry_id}:${r.skill}`));
  const rows: Partial<VocabularyProgressRow>[] = [];
  entryIds.forEach((entryId, i) => {
    for (const skill of ["listening", "recall"] as Skill[]) {
      if (have.has(`${entryId}:${skill}`)) continue;
      const card = scheduler().next(createEmptyCard(now), now, Rating.Easy).card;
      const verifyAt = new Date(now.getTime() + (1 + ((i * 7 + (skill === "recall" ? 3 : 0)) % spread)) * 86_400_000);
      rows.push({
        user_id: userId,
        entry_id: entryId,
        skill,
        ...cardToPatch(card),
        due: verifyAt.toISOString(),
        known_claimed: true,
        first_seen_at: now.toISOString(),
        updated_at: now.toISOString(),
      });
    }
  });
  for (let i = 0; i < rows.length; i += 500) await db.upsert("vocabulary_progress", rows.slice(i, i + 500));
  return rows.length;
}

export type Competence = "none" | "learning" | "solid";

export function competence(row: VocabularyProgressRow | undefined): Competence {
  if (!row || row.reps === 0) return "none";
  if (row.skill === "speaking") {
    if (row.spontaneous_uses >= 2 || (row.state === State.Review && row.stability >= 7)) return "solid";
    return row.spontaneous_uses >= 1 || row.correct_count > 0 ? "learning" : "none";
  }
  if (row.known_claimed) return "learning";
  return row.state === State.Review && row.stability >= 7 ? "solid" : "learning";
}

export interface VocabStats {
  seen: number;
  recognized: number;
  recalled: number;
  spoken: number;
  mastered: number;
  dueBySkill: Record<Skill, number>;
  dueTotal: number;
}

/**
 * "Mastered" requires solid listening AND solid recall AND at least some
 * independent speaking evidence — recognition alone is never mastery.
 */
export function computeVocabStats(rows: VocabularyProgressRow[], now = new Date()): VocabStats {
  const byEntry = new Map<string, Partial<Record<Skill, VocabularyProgressRow>>>();
  const dueBySkill: Record<Skill, number> = { listening: 0, recall: 0, speaking: 0 };
  for (const r of rows) {
    if (!byEntry.has(r.entry_id)) byEntry.set(r.entry_id, {});
    byEntry.get(r.entry_id)![r.skill] = r;
    if (new Date(r.due).getTime() <= now.getTime()) dueBySkill[r.skill]++;
  }
  let recognized = 0;
  let recalled = 0;
  let spoken = 0;
  let mastered = 0;
  for (const skills of byEntry.values()) {
    const l = competence(skills.listening);
    const r = competence(skills.recall);
    const s = competence(skills.speaking);
    if (l === "solid") recognized++;
    if (r === "solid") recalled++;
    if (s === "solid") spoken++;
    if (l === "solid" && r === "solid" && s !== "none") mastered++;
  }
  return {
    seen: byEntry.size,
    recognized,
    recalled,
    spoken,
    mastered,
    dueBySkill,
    dueTotal: dueBySkill.listening + dueBySkill.recall + dueBySkill.speaking,
  };
}

/** Due cards ordered by urgency: boosted first, then most overdue relative to their interval. */
export async function getDueCards(db: Db, userId: string, now = new Date(), limit = 60) {
  const rows = await db.select("vocabulary_progress", {
    where: [eq("user_id", userId), lte("due", now.toISOString())],
  });
  const urgency = (r: VocabularyProgressRow) => {
    const overdueDays = (now.getTime() - new Date(r.due).getTime()) / 86_400_000;
    return r.priority_boost * 10 + overdueDays / Math.max(1, r.scheduled_days) + (r.state === State.Relearning ? 2 : 0);
  };
  return rows
    .sort((a, b) => urgency(b) - urgency(a) || a.entry_id.localeCompare(b.entry_id) || a.skill.localeCompare(b.skill))
    .slice(0, limit);
}

export interface QuotaInput {
  variant: "quick" | "standard" | "deep";
  pace: "slow" | "normal" | "fast";
  dueCount: number;
  accuracy7d: number | null;
  reviews7d: number;
}

/** Adaptive number of new entries for today: fewer when the review backlog or error rate is high. */
export function newWordsQuota(q: QuotaInput): { count: number; reasons: string[] } {
  const reasons: string[] = [];
  let n = { quick: 4, standard: 8, deep: 12 }[q.variant];
  n *= { slow: 0.6, normal: 1, fast: 1.5 }[q.pace];
  if (q.dueCount > 60) {
    n = 0;
    reasons.push(`Masz ${q.dueCount} zaległych powtórek — dziś bez nowych słów, najpierw porządki.`);
  } else if (q.dueCount > 30) {
    n *= 0.3;
    reasons.push(`Dużo zaległych powtórek (${q.dueCount}) — mniej nowych słów.`);
  } else if (q.dueCount > 15) {
    n *= 0.6;
    reasons.push(`Sporo powtórek (${q.dueCount}) — ograniczam nowe słowa.`);
  }
  if (q.accuracy7d !== null && q.reviews7d >= 20) {
    if (q.accuracy7d < 0.7) {
      n *= 0.6;
      reasons.push(`Skuteczność z 7 dni to ${Math.round(q.accuracy7d * 100)}% — utrwalamy, zanim dodamy więcej.`);
    } else if (q.accuracy7d > 0.9) {
      n *= 1.25;
      reasons.push(`Świetna skuteczność (${Math.round(q.accuracy7d * 100)}%) — przyspieszamy.`);
    }
  }
  return { count: Math.max(0, Math.min(20, Math.round(n))), reasons };
}
