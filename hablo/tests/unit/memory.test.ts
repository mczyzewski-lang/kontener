import { describe, expect, it } from "vitest";
import { State } from "ts-fsrs";
import {
  claimKnown,
  competence,
  computeVocabStats,
  getCard,
  getDueCards,
  newWordsQuota,
  recordMissingWord,
  recordReview,
  recordSpeakingEvidence,
} from "@/lib/learning/memory";
import { eq } from "@/lib/db/db";
import { freshDb, USER } from "./helpers";

const T0 = new Date("2026-10-01T09:00:00Z");
const days = (n: number) => new Date(T0.getTime() + n * 86_400_000);

describe("Memory Engine (FSRS)", () => {
  it("schedules each skill independently", async () => {
    const db = await freshDb();
    await recordReview(db, USER, { entryId: "necesitar-v", skill: "listening", exerciseType: "listen_choose", source: "new_words", correct: true, now: T0 });
    const listening = await getCard(db, USER, "necesitar-v", "listening");
    const recall = await getCard(db, USER, "necesitar-v", "recall");
    expect(listening?.reps).toBe(1);
    expect(recall).toBeNull();
  });

  it("intervals grow with successful reviews and reset on failure", async () => {
    const db = await freshDb();
    let now = T0;
    let card = await recordReview(db, USER, { entryId: "casa-n-f", skill: "recall", exerciseType: "recall_say", source: "flashcard", correct: true, now });
    const dues: number[] = [];
    for (let i = 0; i < 4; i++) {
      now = new Date(card.due);
      card = await recordReview(db, USER, { entryId: "casa-n-f", skill: "recall", exerciseType: "recall_say", source: "flashcard", correct: true, now });
      dues.push(new Date(card.due).getTime() - now.getTime());
    }
    expect(dues[3]).toBeGreaterThan(dues[1]);
    expect(card.state).toBe(State.Review);
    now = new Date(card.due);
    const failed = await recordReview(db, USER, { entryId: "casa-n-f", skill: "recall", exerciseType: "recall_say", source: "flashcard", correct: false, now });
    expect(failed.lapses).toBe(1);
    expect(failed.state).toBe(State.Relearning);
    expect(new Date(failed.due).getTime() - now.getTime()).toBeLessThan(86_400_000);
  });

  it("does not reschedule a correct answer on a card that is not due (incidental exposure)", async () => {
    const db = await freshDb();
    let card = await recordReview(db, USER, { entryId: "coche-n-m", skill: "recall", exerciseType: "x", source: "flashcard", correct: true, now: T0 });
    card = await recordReview(db, USER, { entryId: "coche-n-m", skill: "recall", exerciseType: "x", source: "flashcard", correct: true, now: new Date(card.due) });
    expect(card.state).toBe(State.Review);
    const due = card.due;
    const again = await recordReview(db, USER, { entryId: "coche-n-m", skill: "recall", exerciseType: "story", source: "story", correct: true, now: days(0.5) });
    expect(again.due).toBe(due);
    const logs = await db.select("vocabulary_review_logs", { where: [eq("entry_id", "coche-n-m")] });
    expect(logs.at(-1)?.scheduled).toBe(false);
  });

  it("an assisted (hinted) speaking answer is logged but never schedules the speaking card", async () => {
    const db = await freshDb();
    await recordReview(db, USER, { entryId: "querer-v", skill: "speaking", exerciseType: "speak_prompt", source: "flashcard", correct: true, assisted: true, now: T0 });
    const c = await getCard(db, USER, "querer-v", "speaking");
    expect(c?.reps).toBe(0);
    expect(c?.assisted_count).toBe(1);
  });

  it("conversation usage counts only when spontaneous, not echoed and not assisted", async () => {
    const db = await freshDb();
    await recordSpeakingEvidence(db, USER, { entryId: "comprar-v", spontaneous: true, echoed: true, assisted: false, utterance: "compro", now: T0 });
    expect(await getCard(db, USER, "comprar-v", "speaking")).toBeNull();
    await recordSpeakingEvidence(db, USER, { entryId: "comprar-v", spontaneous: true, echoed: false, assisted: false, utterance: "Ayer compré pan", now: T0 });
    const c = await getCard(db, USER, "comprar-v", "speaking");
    expect(c?.spontaneous_uses).toBe(1);
    expect(c?.reps).toBe(1);
  });

  it("a missing word lapses a known recall card and boosts an unknown one", async () => {
    const db = await freshDb();
    const c = await recordReview(db, USER, { entryId: "pagar-v", skill: "recall", exerciseType: "x", source: "flashcard", correct: true, now: T0 });
    await recordReview(db, USER, { entryId: "pagar-v", skill: "recall", exerciseType: "x", source: "flashcard", correct: true, now: new Date(c.due) });
    const lapsed = await recordMissingWord(db, USER, "pagar-v", "conversation", days(2));
    expect(lapsed.lapses).toBe(1);
    const fresh = await recordMissingWord(db, USER, "playa-n-f", "conversation", days(2));
    expect(fresh.priority_boost).toBe(3);
    const due = await getDueCards(db, USER, days(2));
    expect(due[0].entry_id).toBe("playa-n-f");
  });

  it("claimed knowledge is verified later instead of being trusted", async () => {
    const db = await freshDb();
    await claimKnown(db, USER, ["ser-v", "estar-v", "tener-v"], { now: T0, spreadDays: 10 });
    const rows = await db.select("vocabulary_progress", { where: [eq("user_id", USER)] });
    expect(rows).toHaveLength(6);
    expect(rows.every((r) => r.known_claimed && new Date(r.due) > T0)).toBe(true);
    expect(rows.every((r) => competence(r) === "learning")).toBe(true);
    expect(computeVocabStats(rows, T0).mastered).toBe(0);
  });

  it("recognition alone is never mastery", async () => {
    const db = await freshDb();
    let c = await recordReview(db, USER, { entryId: "agua-n-f", skill: "listening", exerciseType: "x", source: "flashcard", correct: true, now: T0 });
    for (let i = 0; i < 6; i++) c = await recordReview(db, USER, { entryId: "agua-n-f", skill: "listening", exerciseType: "x", source: "flashcard", correct: true, now: new Date(c.due) });
    const rows = await db.select("vocabulary_progress", { where: [eq("user_id", USER)] });
    const stats = computeVocabStats(rows, new Date(c.due));
    expect(stats.recognized).toBe(1);
    expect(stats.mastered).toBe(0);
  });
});

describe("adaptive new-word quota", () => {
  it("drops new words when the review backlog is large", () => {
    expect(newWordsQuota({ variant: "standard", pace: "normal", dueCount: 0, accuracy7d: null, reviews7d: 0 }).count).toBe(8);
    expect(newWordsQuota({ variant: "standard", pace: "normal", dueCount: 20, accuracy7d: null, reviews7d: 0 }).count).toBeLessThan(8);
    expect(newWordsQuota({ variant: "standard", pace: "normal", dueCount: 80, accuracy7d: null, reviews7d: 0 }).count).toBe(0);
  });
  it("slows down on low accuracy and speeds up on high accuracy", () => {
    const low = newWordsQuota({ variant: "standard", pace: "normal", dueCount: 0, accuracy7d: 0.5, reviews7d: 50 });
    const high = newWordsQuota({ variant: "standard", pace: "normal", dueCount: 0, accuracy7d: 0.95, reviews7d: 50 });
    expect(low.count).toBeLessThan(8);
    expect(high.count).toBeGreaterThan(8);
    expect(low.reasons.join(" ")).toMatch(/Skuteczność/);
  });
});
