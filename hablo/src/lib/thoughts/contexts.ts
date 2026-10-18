import type { ThoughtContext } from "@/lib/db/types";

/** Display contexts for personal thoughts. */
export const THOUGHT_CONTEXTS: { id: ThoughtContext; label: string }[] = [
  { id: "morning", label: "Poranek" },
  { id: "end_of_work", label: "Koniec pracy" },
  { id: "new_idea", label: "Nowy pomysł" },
  { id: "tension", label: "Napięcie" },
  { id: "family", label: "Rodzina" },
  { id: "rest", label: "Odpoczynek" },
  { id: "travel", label: "Wyjazd" },
];

export const CONTEXT_LABEL = Object.fromEntries(THOUGHT_CONTEXTS.map((c) => [c.id, c.label])) as Record<ThoughtContext, string>;

const ALIASES: Record<string, ThoughtContext> = {
  morning: "morning",
  poranek: "morning",
  rano: "morning",
  ranek: "morning",
  end_of_work: "end_of_work",
  "end of work": "end_of_work",
  "koniec pracy": "end_of_work",
  "po pracy": "end_of_work",
  "koniec dnia pracy": "end_of_work",
  new_idea: "new_idea",
  "new idea": "new_idea",
  "nowy pomysl": "new_idea",
  pomysl: "new_idea",
  idea: "new_idea",
  tension: "tension",
  napiecie: "tension",
  stres: "tension",
  stress: "tension",
  family: "family",
  rodzina: "family",
  rest: "rest",
  odpoczynek: "rest",
  relaks: "rest",
  travel: "travel",
  wyjazd: "travel",
  podroz: "travel",
  podróż: "travel",
  trip: "travel",
};

/** Maps a context label in Polish or English (any case/diacritics) to its id. */
export function parseContext(label: string): ThoughtContext | null {
  const k = label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ł/g, "l")
    .replace(/[_-]+/g, " ")
    .trim();
  return ALIASES[k] ?? ALIASES[k.replace(/ /g, "_")] ?? null;
}

/**
 * The context suggested by the clock alone: morning on weekdays before noon,
 * end of work in the late afternoon, rest in the evening and at weekends.
 * The learner can always pick another context by hand.
 */
export function autoContext(tz: string, at = new Date()): ThoughtContext {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "numeric", hour12: false, weekday: "short" }).formatToParts(at);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 12);
  const weekend = ["Sat", "Sun"].includes(parts.find((p) => p.type === "weekday")?.value ?? "");
  if (hour >= 4 && hour < 12) return weekend ? "rest" : "morning";
  if (!weekend && hour >= 15 && hour < 20) return "end_of_work";
  return "rest";
}
