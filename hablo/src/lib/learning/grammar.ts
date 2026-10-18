import type { Db } from "@/lib/db/db";
import { eq } from "@/lib/db/db";
import type { GrammarProgressRow, GrammarStatus, StartLevel } from "@/lib/db/types";
import { loadContent } from "@/lib/content";
import type { GrammarExercise, GrammarTopicContent } from "@/lib/content/schemas";

/**
 * Grammar Engine. Topics unlock only when every prerequisite is at least
 * "practiced" (mastery >= 0.6 after >= 6 graded attempts). Opening a lesson
 * never unlocks anything by itself.
 */

export const PRACTICED_MASTERY = 0.6;
export const MASTERED_MASTERY = 0.85;

export function statusFor(p: Pick<GrammarProgressRow, "mastery" | "attempts" | "conversation_uses" | "status">): GrammarStatus {
  if (p.status === "locked") return "locked";
  if (p.mastery >= MASTERED_MASTERY && p.attempts >= 12 && p.conversation_uses >= 3) return "mastered";
  if (p.mastery >= PRACTICED_MASTERY && p.attempts >= 6) return "practiced";
  if (p.attempts > 0) return "learning";
  return "available";
}

/** Exponential moving average so recent performance dominates. */
export function updateMastery(mastery: number, score: number, weight = 0.2): number {
  return Math.max(0, Math.min(1, mastery * (1 - weight) + score * weight));
}

/** How many leading stages to open (but not mark as mastered) for a self-reported level. */
export function stagesOpenForLevel(level: StartLevel): number {
  return { unknown: 1, beginner: 1, elementary: 3, intermediate: 6, advanced: 9 }[level];
}

export async function getGrammarProgress(db: Db, userId: string) {
  const rows = await db.select("grammar_progress", { where: [eq("user_id", userId)] });
  return new Map(rows.map((r) => [r.topic_id, r]));
}

/** Creates missing progress rows and recomputes which topics are unlocked. */
export async function syncGrammarUnlocks(db: Db, userId: string, openStages = 1): Promise<GrammarProgressRow[]> {
  const topics = loadContent().grammar;
  const progress = await getGrammarProgress(db, userId);
  const now = new Date().toISOString();
  const updates: Partial<GrammarProgressRow>[] = [];
  for (const t of topics) {
    const p = progress.get(t.id);
    const prereqsOk = t.prerequisites.every((id) => {
      const pp = progress.get(id);
      return !!pp && (pp.status === "practiced" || pp.status === "mastered");
    });
    const shouldOpen = t.stage <= openStages || prereqsOk;
    if (!p) {
      updates.push({ user_id: userId, topic_id: t.id, status: shouldOpen ? "available" : "locked", updated_at: now });
    } else if (p.status === "locked" && shouldOpen) {
      updates.push({ ...p, status: "available", updated_at: now });
    }
  }
  if (updates.length) await db.upsert("grammar_progress", updates);
  return [...(await getGrammarProgress(db, userId)).values()];
}

export interface GrammarResult {
  topicId: string;
  correct: boolean;
  /** 0..1 partial credit (e.g. minor issue = 0.7). */
  score: number;
  source: "exercise" | "mini_conversation" | "conversation";
}

export async function applyGrammarResult(db: Db, userId: string, r: GrammarResult): Promise<GrammarProgressRow> {
  const progress = await getGrammarProgress(db, userId);
  const p = progress.get(r.topicId);
  const now = new Date();
  const base: GrammarProgressRow =
    p ??
    ({
      user_id: userId,
      topic_id: r.topicId,
      status: "available",
      mastery: 0,
      attempts: 0,
      correct: 0,
      conversation_uses: 0,
      conversation_errors: 0,
      lesson_completed_at: null,
      last_practiced_at: null,
      next_review_at: null,
      updated_at: now.toISOString(),
    } as GrammarProgressRow);
  // Locked topics can still be *used* in conversation, which counts as evidence, but stay locked.
  const fromConversation = r.source === "conversation";
  const next: GrammarProgressRow = {
    ...base,
    mastery: updateMastery(base.mastery, r.score, fromConversation ? 0.1 : 0.2),
    attempts: base.attempts + (fromConversation ? 0 : 1),
    correct: base.correct + (r.correct && !fromConversation ? 1 : 0),
    conversation_uses: base.conversation_uses + (fromConversation && r.correct ? 1 : 0),
    conversation_errors: base.conversation_errors + (fromConversation && !r.correct ? 1 : 0),
    last_practiced_at: now.toISOString(),
    updated_at: now.toISOString(),
  };
  next.status = statusFor(next);
  // Weak topics come back sooner.
  const days = next.mastery < 0.5 ? 1 : next.mastery < PRACTICED_MASTERY ? 2 : next.mastery < MASTERED_MASTERY ? 5 : 14;
  next.next_review_at = new Date(now.getTime() + days * 86_400_000).toISOString();
  const [saved] = await db.upsert("grammar_progress", next);
  if (saved.status === "practiced" || saved.status === "mastered") await syncGrammarUnlocks(db, userId);
  return saved;
}

/** Exercises ordered to match the learner's mastery: easier first while mastery is low. */
export function pickExercises(topic: GrammarTopicContent, mastery: number, count = 6): GrammarExercise[] {
  const target = mastery < 0.35 ? 1 : mastery < 0.7 ? 2 : 3;
  return [...topic.exercises]
    .map((e, i) => ({ e, i, d: Math.abs(e.difficulty - target) }))
    .sort((a, b) => a.d - b.d || a.i - b.i)
    .slice(0, count)
    .sort((a, b) => a.e.difficulty - b.e.difficulty || a.i - b.i)
    .map((x) => x.e);
}

/** The topic the learner should work on next: weakest unlocked, due topic first. */
export function nextGrammarTopic(rows: GrammarProgressRow[], now = new Date()): { topicId: string; reason: string } | null {
  const topics = loadContent().grammar;
  const byId = new Map(rows.map((r) => [r.topic_id, r]));
  const open = topics.filter((t) => {
    const p = byId.get(t.id);
    return p && p.status !== "locked" && p.status !== "mastered";
  });
  if (!open.length) return null;
  const weakWithErrors = open
    .map((t) => byId.get(t.id)!)
    .filter((p) => p.conversation_errors > p.conversation_uses && p.attempts > 0)
    .sort((a, b) => a.mastery - b.mastery)[0];
  if (weakWithErrors)
    return { topicId: weakWithErrors.topic_id, reason: "W rozmowach często pojawiają się tu błędy." };
  const due = open
    .map((t) => byId.get(t.id)!)
    .filter((p) => p.attempts > 0 && p.next_review_at && new Date(p.next_review_at) <= now)
    .sort((a, b) => a.mastery - b.mastery)[0];
  if (due) return { topicId: due.topic_id, reason: "Czas na powtórkę tej konstrukcji." };
  const fresh = open.find((t) => (byId.get(t.id)?.attempts ?? 0) === 0 || (byId.get(t.id)?.status ?? "") === "learning");
  if (fresh) return { topicId: fresh.id, reason: "Kolejny etap programu." };
  return { topicId: open[0].id, reason: "Utrwalenie." };
}
