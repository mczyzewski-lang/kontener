import { describe, expect, it } from "vitest";
import { buildDailyPlan, type PlannerInput } from "@/lib/learning/planner";
import { changeTodayVariant, getOrCreateTodayPlan, updatePlanItem } from "@/lib/learning/plan-service";
import { recordReview } from "@/lib/learning/memory";
import { eq } from "@/lib/db/db";
import { freshDb, USER } from "./helpers";

const base: PlannerInput = {
  date: "2026-10-14",
  variant: "standard",
  dueCount: 10,
  newQuota: { count: 8, reasons: [] },
  newEntryIds: ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"],
  grammarNext: { topicId: "g02-present", title: "Czas teraźniejszy", reason: "Kolejny etap programu." },
  storyRetell: null,
  storyContinue: { storyId: "s1", title: "Un coche grande" },
  conversation: { scenarioId: "cafe-order", title: "Zamawiam kawę", mode: "guided", reason: "test" },
  assessmentDue: false,
  sprint: null,
  backlog: [],
};

describe("daily planner (pure)", () => {
  it("is deterministic for identical inputs", () => {
    expect(buildDailyPlan(base)).toEqual(buildDailyPlan(base));
  });

  it("standard plan ≈ 30 min: reviews, new words, story/grammar, conversation, feedback", () => {
    const out = buildDailyPlan(base);
    const types = out.items.map((i) => i.type);
    expect([types[0], types[1], types[3], types[4]]).toEqual(["review", "new_words", "conversation", "feedback"]);
    expect(["story", "grammar"]).toContain(types[2]);
    // The slot alternates between story and grammar day by day.
    const next = buildDailyPlan({ ...base, date: "2026-10-15" }).items[2].type;
    expect(next).not.toBe(types[2]);
    expect(out.targetMinutes).toBeGreaterThanOrEqual(25);
    expect(out.targetMinutes).toBeLessThanOrEqual(32);
  });

  it("a big review backlog takes time from new words", () => {
    const heavy = buildDailyPlan({ ...base, dueCount: 40, newQuota: { count: 2, reasons: ["Dużo zaległych"] } });
    const review = heavy.items.find((i) => i.type === "review")!;
    expect(review.est_minutes).toBeGreaterThan(5);
    const nw = heavy.items.find((i) => i.type === "new_words");
    expect(nw?.entry_ids.length ?? 0).toBeLessThanOrEqual(2);
    expect(heavy.rationale.join(" ")).toMatch(/Zaległe powtórki/);
  });

  it("quick variant stays around 10 minutes", () => {
    const q = buildDailyPlan({ ...base, variant: "quick", newQuota: { count: 4, reasons: [] } });
    expect(q.targetMinutes).toBeLessThanOrEqual(11);
    expect(q.items.some((i) => i.type === "conversation")).toBe(true);
  });

  it("weekly assessment replaces the conversation once a week", () => {
    const a = buildDailyPlan({ ...base, assessmentDue: true });
    expect(a.items.some((i) => i.type === "assessment")).toBe(true);
    expect(a.items.some((i) => i.type === "conversation")).toBe(false);
  });

  it("grammar errors from conversations win the story/grammar slot", () => {
    const out = buildDailyPlan({
      ...base,
      date: "2026-10-15",
      backlog: [{ id: "t1", type: "grammar", goal: "Błędy w ser/estar", priority: 80, entry_ids: [], grammar_topic_ids: ["g03-ser-estar"], scenario_id: null }],
    });
    const g = out.items.find((i) => i.type === "grammar")!;
    expect(g.grammar_topic_ids).toEqual(["g03-ser-estar"]);
    expect(out.scheduledTaskIds).toContain("t1");
  });

  it("words missing in conversations go into the review item", () => {
    const out = buildDailyPlan({
      ...base,
      backlog: [{ id: "t2", type: "review_words", goal: "x", priority: 75, entry_ids: ["llave"], grammar_topic_ids: [], scenario_id: null }],
    });
    expect(out.items[0].type).toBe("review");
    expect(out.items[0].entry_ids).toEqual(["llave"]);
  });
});

describe("plan persistence", () => {
  it("does not change after a refresh (stored once per day)", async () => {
    const db = await freshDb();
    const now = new Date("2026-10-14T08:00:00Z");
    const a = await getOrCreateTodayPlan(db, USER, { now });
    // Learning activity between refreshes must not reshuffle today's queue.
    await recordReview(db, USER, { entryId: "casa-n-f", skill: "recall", exerciseType: "x", source: "flashcard", correct: false, now });
    const b = await getOrCreateTodayPlan(db, USER, { now: new Date("2026-10-14T20:00:00Z") });
    expect(b.plan.id).toBe(a.plan.id);
    expect(b.items.map((i) => [i.type, i.entry_ids])).toEqual(a.items.map((i) => [i.type, i.entry_ids]));
    expect(await db.count("daily_plans", [eq("user_id", USER)])).toBe(1);
  });

  it("supports interrupting and continuing: item states persist and the plan completes", async () => {
    const db = await freshDb();
    const now = new Date("2026-10-14T08:00:00Z");
    const { plan, items } = await getOrCreateTodayPlan(db, USER, { now });
    await updatePlanItem(db, USER, items[0].id, { status: "in_progress" });
    const again = await getOrCreateTodayPlan(db, USER, { now });
    expect(again.items[0].status).toBe("in_progress");
    for (const it of items) await updatePlanItem(db, USER, it.id, { status: "done" });
    const done = (await db.select("daily_plans", { where: [eq("id", plan.id)] }))[0];
    expect(done.status).toBe("completed");
  });

  it("variant can change only before the lesson starts", async () => {
    const db = await freshDb();
    const now = new Date("2026-10-14T08:00:00Z");
    const a = await getOrCreateTodayPlan(db, USER, { now });
    const q = await changeTodayVariant(db, USER, "quick", now);
    expect(q.plan.variant).toBe("quick");
    expect(q.plan.id).not.toBe(a.plan.id);
    await updatePlanItem(db, USER, q.items[0].id, { status: "done" });
    await expect(changeTodayVariant(db, USER, "deep", now)).rejects.toThrow(/rozpoczęty/);
  });

  it("next day's plan reflects real progress (due reviews appear)", async () => {
    const db = await freshDb();
    const d1 = new Date("2026-10-14T08:00:00Z");
    const p1 = await getOrCreateTodayPlan(db, USER, { now: d1 });
    const newItem = p1.items.find((i) => i.type === "new_words")!;
    for (const id of newItem.entry_ids) {
      await recordReview(db, USER, { entryId: id, skill: "recall", exerciseType: "recall_say", source: "new_words", correct: false, now: d1 });
    }
    const p2 = await getOrCreateTodayPlan(db, USER, { now: new Date("2026-10-15T08:00:00Z") });
    const review = p2.items.find((i) => i.type === "review");
    expect(review).toBeTruthy();
    expect((p2.plan.inputs as { dueCount: number }).dueCount).toBeGreaterThanOrEqual(newItem.entry_ids.length);
    const p2New = p2.items.find((i) => i.type === "new_words");
    for (const id of p2New?.entry_ids ?? []) expect(newItem.entry_ids).not.toContain(id);
  });
});
