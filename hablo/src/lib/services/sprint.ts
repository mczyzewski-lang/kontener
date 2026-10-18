import "server-only";
import type { Session } from "@/lib/session";
import { eq } from "@/lib/db/db";
import { loadContent } from "@/lib/content";
import { planSprint } from "@/lib/ai/tasks";
import { addTask } from "@/lib/learning/intelligence";
import { getEntries } from "@/lib/learning/vocabulary";
import { getPrefs } from "@/lib/learning/profile";
import { addDays, localDate } from "@/lib/learning/time";
import { normalize } from "@/lib/learning/text";
import { HttpError } from "@/lib/http-error";

/**
 * Personal Sprint: a short-term focus ("next week I go to Spain: restaurant,
 * shopping, neighbours"). Sprint scenarios and phrases get priority in the
 * daily plan for its duration, but reviews still come first.
 */
export async function createSprint(s: Session, goalText: string) {
  const goal = goalText.trim().slice(0, 500);
  if (goal.length < 8) throw new HttpError(400, "Opisz cel sprintu w jednym–dwóch zdaniach.");
  const { scenarios } = loadContent();
  const entries = await getEntries(s.db, s.userId);
  const phrases = entries.filter((e) => e.kind === "phrase");
  const prefs = await getPrefs(s.db, s.userId);
  const ai = await planSprint(
    { db: s.db, userId: s.userId, prefs },
    {
      goal_text: goal,
      scenarios: scenarios.map((x) => ({ id: x.id, title: x.title, keywords_pl: x.keywords_pl })),
      phrases: phrases.map((p) => ({ id: p.id, es: p.lemma, pl: p.translations[0] })),
    },
  );
  const g = ` ${normalize(goal)} `;
  const matchedScenarios = ai
    ? ai.scenario_ids.filter((id) => scenarios.some((x) => x.id === id))
    : scenarios.filter((x) => x.keywords_pl.some((k) => g.includes(normalize(k).slice(0, Math.max(4, normalize(k).length - 2))))).map((x) => x.id);
  const scenarioIds = matchedScenarios.length ? matchedScenarios.slice(0, 5) : ["neighbor-chat", "restaurant-waiter"];
  const topics = new Set(scenarioIds.flatMap((id) => scenarios.find((x) => x.id === id)?.topics ?? []));
  const phraseIds = ai
    ? ai.phrase_ids.filter((id) => phrases.some((p) => p.id === id))
    : phrases.filter((p) => p.topics.some((t) => topics.has(t))).map((p) => p.id);
  const lemmaIds = (ai?.focus_lemmas ?? [])
    .map((l) => entries.find((e) => e.kind === "word" && normalize(e.lemma) === normalize(l))?.id)
    .filter((x): x is string => !!x);
  const daysMatch = /(\d+)\s*(dni|dzie|tydz|tygod)/i.exec(goal);
  const days = Math.max(1, Math.min(21, ai?.days ?? (daysMatch ? (/tydz|tygod/i.test(daysMatch[2]) ? Number(daysMatch[1]) * 7 : Number(daysMatch[1])) : /tydzie|tygodni/i.test(goal) ? 7 : 7)));
  const today = localDate(prefs.timezone);

  await s.db.update("sprints", [eq("user_id", s.userId), eq("status", "active")], { status: "cancelled" });
  const [sprint] = await s.db.insert("sprints", {
    user_id: s.userId,
    goal_text: goal,
    summary: ai?.summary_pl ?? `Sprint na ${days} dni: ${scenarioIds.map((id) => scenarios.find((x) => x.id === id)?.title).join(", ")}.`,
    scenario_ids: scenarioIds,
    entry_ids: [...new Set([...phraseIds.slice(0, 20), ...lemmaIds])],
    starts_on: today,
    ends_on: addDays(today, days - 1),
  });
  for (const [i, id] of scenarioIds.entries()) {
    await addTask(s.db, s.userId, {
      type: "conversation",
      goal: `Sprint: ${scenarios.find((x) => x.id === id)?.title}`,
      source: "sprint",
      scenario_id: id,
      priority: 80 - i * 5,
      due_date: addDays(today, Math.min(days - 1, i)),
    });
  }
  return { sprint, aiPlanned: !!ai };
}

export async function cancelSprint(s: Session) {
  await s.db.update("sprints", [eq("user_id", s.userId), eq("status", "active")], { status: "cancelled" });
}
