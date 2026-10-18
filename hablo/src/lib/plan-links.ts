import type { DailyPlanItemRow } from "@/lib/db/types";

/** Where each daily plan item is practised. */
export function planItemHref(item: Pick<DailyPlanItemRow, "id" | "type" | "payload" | "grammar_topic_ids">): string {
  const p = (item.payload ?? {}) as Record<string, string | undefined>;
  const q = `item=${item.id}`;
  switch (item.type) {
    case "review":
      return `/learn/review?${q}`;
    case "new_words":
      return `/learn/new?${q}`;
    case "story":
      if (p.mode === "retell" && p.story_id) return `/stories/${p.story_id}?${q}&retell=1`;
      if (p.story_id) return `/stories/${p.story_id}?${q}`;
      return `/stories/new?${q}`;
    case "grammar":
      return `/grammar/${p.topic_id ?? item.grammar_topic_ids[0]}?${q}`;
    case "conversation":
    case "sprint":
      return `/speak/session?scenario=${p.scenario_id ?? ""}&mode=${p.mode ?? "guided"}&${q}`;
    case "assessment":
      return `/speak/session?mode=assessment&${q}`;
    case "feedback":
      return `/lesson/feedback?${q}`;
  }
}

export const PLAN_ITEM_LABEL: Record<DailyPlanItemRow["type"], string> = {
  review: "Powtórki",
  new_words: "Nowe słowa",
  story: "Historia",
  grammar: "Gramatyka",
  conversation: "Rozmowa",
  assessment: "Test tygodniowy",
  feedback: "Podsumowanie",
  sprint: "Sprint",
};
