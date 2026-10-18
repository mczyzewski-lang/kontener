import type { Db } from "@/lib/db/db";
import { eq, gte, inList } from "@/lib/db/db";
import type { DailyPlanItemRow, DailyPlanRow, PlanVariant } from "@/lib/db/types";
import { loadContent } from "@/lib/content";
import { computeVocabStats, newWordsQuota } from "./memory";
import { getEntries, getProgress, selectNewEntries } from "./vocabulary";
import { nextGrammarTopic, syncGrammarUnlocks } from "./grammar";
import { ensureStarterStories, nextVariant, storiesDueForRetell } from "./story";
import { buildDailyPlan, type PlannerInput } from "./planner";
import { getPrefs, getProfile, recentEvents } from "./profile";
import { addDays, localDate, weekStart } from "./time";
import { scenariosFor } from "./situations";

export interface PlanWithItems {
  plan: DailyPlanRow;
  items: DailyPlanItemRow[];
}

export async function getPlan(db: Db, userId: string, date: string): Promise<PlanWithItems | null> {
  const plan = (await db.select("daily_plans", { where: [eq("user_id", userId), eq("plan_date", date)], limit: 1 }))[0];
  if (!plan) return null;
  const items = await db.select("daily_plan_items", { where: [eq("plan_id", plan.id)], order: [{ col: "position" }] });
  return { plan, items };
}

/** Gathers everything the planner needs from the learner's real progress. */
export async function plannerInputs(db: Db, userId: string, variant: PlanVariant, now = new Date()): Promise<PlannerInput> {
  const prefs = await getPrefs(db, userId);
  const profile = await getProfile(db, userId);
  const date = localDate(prefs.timezone, now);
  const [entries, progress] = await Promise.all([getEntries(db, userId), getProgress(db, userId)]);
  const endOfDay = new Date(now.getTime() + 6 * 3_600_000);
  const stats = computeVocabStats(progress, endOfDay);

  // Accuracy of scheduled reviews in the last 7 days.
  const since = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const logs = await db.select("vocabulary_review_logs", { where: [eq("user_id", userId), gte("reviewed_at", since)] });
  const graded = logs.filter((l) => l.scheduled);
  const accuracy = graded.length ? graded.filter((l) => l.correct).length / graded.length : null;

  const sprint = (await db.select("sprints", { where: [eq("user_id", userId), eq("status", "active")], limit: 1 }))[0] ?? null;
  const activeSprint = sprint && sprint.ends_on >= date ? sprint : null;

  const quota = newWordsQuota({
    variant,
    pace: prefs.new_words_pace,
    dueCount: stats.dueTotal,
    accuracy7d: accuracy,
    reviews7d: graded.length,
  });
  const newEntryIds = selectNewEntries(entries, progress, quota.count, {
    focusSituations: prefs.focus_situations,
    priorityIds: activeSprint?.entry_ids ?? [],
  });

  const grammarRows = await syncGrammarUnlocks(db, userId);
  const g = nextGrammarTopic(grammarRows, now);
  const topic = g ? loadContent().grammar.find((t) => t.id === g.topicId) : null;

  await ensureStarterStories(db, userId, entries);
  const due = await storiesDueForRetell(db, userId, now);
  const retell = due.find((s) => s.variant === "original" || !s.parent_story_id);
  const inProgress =
    (await db.select("stories", { where: [eq("user_id", userId), eq("status", "in_progress")], limit: 1 }))[0] ??
    (await db.select("stories", { where: [eq("user_id", userId), eq("status", "new")], order: [{ col: "created_at" }], limit: 1 }))[0];

  const conversation = await chooseScenario(db, userId, prefs.focus_situations, activeSprint?.scenario_ids ?? [], stats.recalled, profile?.start_level ?? "unknown");

  const thisWeek = weekStart(date);
  const assessed = await db.count("weekly_assessments", [eq("user_id", userId), eq("week_start", thisWeek)]);
  const events = await recentEvents(db, userId, addDays(date, -7));
  const activeDays = new Set(events.map((e) => e.local_date));
  const onboardedDaysAgo = profile?.onboarded_at ? (now.getTime() - Date.parse(profile.onboarded_at)) / 86_400_000 : 0;

  const backlog = await db.select("learning_tasks", {
    where: [eq("user_id", userId), eq("status", "pending")],
    order: [{ col: "priority", asc: false }, { col: "created_at" }],
    limit: 20,
  });

  return {
    date,
    variant,
    dueCount: stats.dueTotal,
    newQuota: quota,
    newEntryIds,
    grammarNext: g && topic ? { topicId: g.topicId, title: topic.title, reason: g.reason } : null,
    storyRetell: retell ? { storyId: retell.id, title: retell.title, nextVariant: nextVariant(retell.retell_count) } : null,
    storyContinue: inProgress ? { storyId: inProgress.id, title: inProgress.title } : null,
    conversation,
    assessmentDue: !assessed && activeDays.size >= 3 && onboardedDaysAgo >= 5,
    sprint: activeSprint ? { id: activeSprint.id, goal: activeSprint.goal_text, entryIds: activeSprint.entry_ids } : null,
    backlog,
  };
}

async function chooseScenario(
  db: Db,
  userId: string,
  focus: string[],
  sprintScenarios: string[],
  recalledWords: number,
  level: string,
): Promise<PlannerInput["conversation"]> {
  const scenarios = loadContent().scenarios;
  const sessions = await db.select("conversation_sessions", {
    where: [eq("user_id", userId)],
    order: [{ col: "started_at", asc: false }],
    limit: 40,
  });
  const lastUsed = new Map<string, number>();
  sessions.forEach((s, i) => s.scenario_id && !lastUsed.has(s.scenario_id) && lastUsed.set(s.scenario_id, i));
  const mastered = new Set(
    (await db.select("learner_memory", { where: [eq("user_id", userId), eq("kind", "mastered_scenario")] })).map((m) => m.key),
  );
  const preferred = sprintScenarios.length ? sprintScenarios : scenariosFor(focus);
  const beginner = level === "beginner" || level === "unknown";
  const maxLevel = beginner ? (recalledWords > 150 ? 2 : 1) : level === "elementary" ? 2 : 5;
  const candidates = scenarios
    .filter((s) => s.level <= maxLevel || preferred.includes(s.id))
    .map((s) => ({
      s,
      score:
        (preferred.includes(s.id) ? 0 : 100) +
        (mastered.has(s.id) ? 50 : 0) -
        (lastUsed.has(s.id) ? lastUsed.get(s.id)! : 40) +
        s.level,
    }))
    .sort((a, b) => a.score - b.score || a.s.id.localeCompare(b.s.id));
  const pick = candidates[0]?.s;
  if (!pick) return null;
  const total = sessions.length;
  let mode: "guided" | "natural" | "real_life" =
    beginner && recalledWords < 150 ? "guided" : pick.default_mode === "real_life" ? "natural" : pick.default_mode;
  if (!beginner && total > 0 && total % 4 === 3) mode = "real_life";
  const reason = sprintScenarios.includes(pick.id)
    ? "scenariusz z twojego sprintu."
    : preferred.includes(pick.id)
      ? "sytuacja ważna dla ciebie, najdawniej ćwiczona."
      : "nowa sytuacja dla urozmaicenia.";
  return { scenarioId: pick.id, title: pick.title, mode, reason };
}

/**
 * Returns today's plan, creating it exactly once. Concurrent requests race on
 * the unique (user_id, plan_date) constraint; the loser re-reads the winner.
 */
export async function getOrCreateTodayPlan(
  db: Db,
  userId: string,
  opts: { now?: Date; variant?: PlanVariant } = {},
): Promise<PlanWithItems> {
  const now = opts.now ?? new Date();
  const prefs = await getPrefs(db, userId);
  const date = localDate(prefs.timezone, now);
  const existing = await getPlan(db, userId, date);
  if (existing) return existing;

  const variant = opts.variant ?? prefs.plan_variant;
  const input = await plannerInputs(db, userId, variant, now);
  const out = buildDailyPlan(input);
  let plan: DailyPlanRow;
  try {
    [plan] = await db.insert("daily_plans", {
      user_id: userId,
      plan_date: date,
      variant,
      target_minutes: out.targetMinutes,
      rationale: out.rationale,
      inputs: { dueCount: input.dueCount, newQuota: input.newQuota.count, assessmentDue: input.assessmentDue },
    });
  } catch {
    const again = await getPlan(db, userId, date);
    if (again) return again;
    throw new Error("Nie udało się utworzyć planu dnia.");
  }
  const items = out.items.length
    ? await db.insert(
        "daily_plan_items",
        out.items.map((i) => ({ ...i, plan_id: plan.id, user_id: userId })),
      )
    : [];
  if (out.scheduledTaskIds.length) {
    await db.update("learning_tasks", [eq("user_id", userId), inList("id", out.scheduledTaskIds)], { status: "scheduled" });
  }
  return { plan, items: items.sort((a, b) => a.position - b.position) };
}

/** Rebuilds today's plan with a different variant — only allowed before anything was started. */
export async function changeTodayVariant(db: Db, userId: string, variant: PlanVariant, now = new Date()) {
  const prefs = await getPrefs(db, userId);
  const date = localDate(prefs.timezone, now);
  const existing = await getPlan(db, userId, date);
  if (existing) {
    if (existing.items.some((i) => i.status !== "pending")) {
      throw new Error("Plan jest już rozpoczęty — wariant można zmienić jutro.");
    }
    if (existing.plan.variant === variant) return existing;
    const taskIds = existing.items.map((i) => i.task_id).filter((x): x is string => !!x);
    if (taskIds.length) await db.update("learning_tasks", [eq("user_id", userId), inList("id", taskIds)], { status: "pending" });
    await db.remove("daily_plan_items", [eq("plan_id", existing.plan.id)]);
    await db.remove("daily_plans", [eq("id", existing.plan.id)]);
  }
  return getOrCreateTodayPlan(db, userId, { now, variant });
}

export async function updatePlanItem(
  db: Db,
  userId: string,
  itemId: string,
  patch: { status: DailyPlanItemRow["status"]; result?: unknown },
) {
  const now = new Date().toISOString();
  const [item] = await db.update("daily_plan_items", [eq("user_id", userId), eq("id", itemId)], {
    status: patch.status,
    ...(patch.result !== undefined ? { result: patch.result } : {}),
    ...(patch.status === "in_progress" ? { started_at: now } : {}),
    ...(patch.status === "done" || patch.status === "skipped" ? { completed_at: now } : {}),
  });
  if (!item) return null;
  if (item.task_id && patch.status === "done") {
    await db.update("learning_tasks", [eq("user_id", userId), eq("id", item.task_id)], { status: "done", completed_at: now });
  }
  const siblings = await db.select("daily_plan_items", { where: [eq("plan_id", item.plan_id)] });
  if (siblings.every((s) => s.status === "done" || s.status === "skipped")) {
    await db.update("daily_plans", [eq("id", item.plan_id)], { status: "completed", completed_at: now });
  }
  return item;
}
