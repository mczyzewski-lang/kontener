import type { DailyPlanItemRow, LearningTaskRow, PlanItemType, PlanVariant } from "@/lib/db/types";

/**
 * Learning Intelligence Engine — the daily planner. This is a PURE function:
 * given the same inputs it always returns the same plan, and the plan is
 * stored once per day (unique user_id + plan_date), so refreshing the page
 * never reshuffles the queue.
 */

export interface PlannerInput {
  date: string;
  variant: PlanVariant;
  dueCount: number;
  newQuota: { count: number; reasons: string[] };
  newEntryIds: string[];
  grammarNext: { topicId: string; title: string; reason: string } | null;
  storyRetell: { storyId: string; title: string; nextVariant: string } | null;
  storyContinue: { storyId: string; title: string } | null;
  conversation: { scenarioId: string; title: string; mode: "guided" | "natural" | "real_life"; reason: string } | null;
  assessmentDue: boolean;
  sprint: { id: string; goal: string; entryIds: string[] } | null;
  backlog: Pick<LearningTaskRow, "id" | "type" | "goal" | "priority" | "entry_ids" | "grammar_topic_ids" | "scenario_id">[];
}

export type PlanItemDraft = Pick<
  DailyPlanItemRow,
  "position" | "type" | "title" | "goal" | "est_minutes" | "entry_ids" | "grammar_topic_ids" | "priority" | "payload" | "task_id"
>;

export interface PlannerOutput {
  targetMinutes: number;
  items: PlanItemDraft[];
  rationale: string[];
  scheduledTaskIds: string[];
}

const BUDGET: Record<PlanVariant, { total: number; review: number; newWords: number; story: number; grammar: number; conversation: number; feedback: number }> = {
  quick: { total: 10, review: 4, newWords: 3, story: 0, grammar: 0, conversation: 3, feedback: 0 },
  standard: { total: 30, review: 5, newWords: 7, story: 5, grammar: 0, conversation: 10, feedback: 3 },
  deep: { total: 45, review: 7, newWords: 10, story: 6, grammar: 6, conversation: 13, feedback: 3 },
};

/** ~18 s per due card, ~50 s per new entry (intro + two first exercises). */
const SEC_PER_REVIEW = 18;
const SEC_PER_NEW = 50;

function dayOfYear(date: string): number {
  const d = Date.parse(`${date}T12:00:00Z`);
  return Math.floor((d - Date.parse(`${date.slice(0, 4)}-01-01T12:00:00Z`)) / 86_400_000);
}

export function buildDailyPlan(input: PlannerInput): PlannerOutput {
  const b = { ...BUDGET[input.variant] };
  const rationale: string[] = [];
  const scheduledTaskIds: string[] = [];

  // 1. Reviews first: memory decays, so the backlog gets the time it needs.
  const reviewNeed = Math.ceil((input.dueCount * SEC_PER_REVIEW) / 60);
  let reviewMin = Math.max(input.dueCount > 0 ? Math.min(b.review, Math.max(2, reviewNeed)) : 0, 0);
  if (reviewNeed > b.review) {
    const extra = Math.min(reviewNeed - b.review, b.newWords + Math.floor(b.story / 2));
    reviewMin = b.review + extra;
    const fromNew = Math.min(extra, b.newWords);
    b.newWords -= fromNew;
    b.story -= Math.min(b.story, extra - fromNew);
    rationale.push(`Zaległe powtórki (${input.dueCount}) dostają ${reviewMin} min — kosztem nowego materiału.`);
  } else if (input.dueCount === 0) {
    b.newWords += b.review;
    rationale.push("Brak zaległych powtórek — więcej czasu na nowe słowa.");
  }

  // 2. New words, limited both by the adaptive quota and by the time left.
  const byTime = Math.floor((b.newWords * 60) / SEC_PER_NEW);
  const newIds = input.newEntryIds.slice(0, Math.min(input.newQuota.count, byTime));
  rationale.push(...input.newQuota.reasons);
  if (input.sprint) rationale.push(`Sprint: „${input.sprint.goal}” — słownictwo i scenariusze sprintu mają pierwszeństwo.`);

  const items: Omit<PlanItemDraft, "position">[] = [];
  // Words the learner was missing in recent conversations go first into the review item.
  const urgentWords = input.backlog.filter((t) => t.type === "review_words" && t.priority >= 60);
  const urgentEntryIds = [...new Set(urgentWords.flatMap((t) => t.entry_ids))];
  scheduledTaskIds.push(...urgentWords.map((t) => t.id));
  if (reviewMin > 0 || urgentEntryIds.length) {
    items.push({
      type: "review",
      title: "Powtórki",
      goal: `Utrwal ${input.dueCount} kart${urgentEntryIds.length ? ` i ${urgentEntryIds.length} słów, których brakowało w rozmowach` : ""}.`,
      est_minutes: Math.max(2, reviewMin),
      entry_ids: urgentEntryIds,
      grammar_topic_ids: [],
      priority: 90,
      payload: { limit: Math.max(10, Math.ceil((reviewMin * 60) / SEC_PER_REVIEW)) },
      task_id: urgentWords[0]?.id ?? null,
    });
  }
  if (newIds.length) {
    items.push({
      type: "new_words",
      title: "Nowe słowa",
      goal: `Poznaj ${newIds.length} ${newIds.length === 1 ? "nowe słowo" : "nowych słów i zwrotów"} i od razu użyj ich na głos.`,
      est_minutes: Math.max(2, Math.ceil((newIds.length * SEC_PER_NEW) / 60)),
      entry_ids: newIds,
      grammar_topic_ids: [],
      priority: 80,
      payload: {},
      task_id: null,
    });
  }

  // 3. Story or grammar. Grammar wins when a weak construction keeps failing in conversations.
  const grammarTask = input.backlog.find((t) => t.type === "grammar" && t.grammar_topic_ids.length && t.priority >= 60);
  const grammarTopic = grammarTask
    ? { topicId: grammarTask.grammar_topic_ids[0], reason: grammarTask.goal }
    : input.grammarNext
      ? { topicId: input.grammarNext.topicId, reason: input.grammarNext.reason }
      : null;
  if (grammarTask) scheduledTaskIds.push(grammarTask.id);
  const storySlot = b.story > 0;
  const preferGrammar =
    !!grammarTask || (input.grammarNext?.reason.includes("błędy") ?? false) || (!input.storyRetell && dayOfYear(input.date) % 2 === 1);
  const pushGrammar = (min: number) =>
    grammarTopic &&
    items.push({
      type: "grammar",
      title: input.grammarNext && input.grammarNext.topicId === grammarTopic.topicId ? input.grammarNext.title : "Gramatyka w praktyce",
      goal: grammarTopic.reason,
      est_minutes: min,
      entry_ids: [],
      grammar_topic_ids: [grammarTopic.topicId],
      priority: 70,
      payload: { topic_id: grammarTopic.topicId },
      task_id: grammarTask?.id ?? null,
    });
  const pushStory = (min: number) => {
    if (input.storyRetell) {
      items.push({
        type: "story",
        title: `Historia powraca: ${input.storyRetell.title}`,
        goal: "Opowiedz znaną historię w nowej wersji — ten sam materiał, nowa gramatyka.",
        est_minutes: min,
        entry_ids: [],
        grammar_topic_ids: [],
        priority: 65,
        payload: { story_id: input.storyRetell.storyId, mode: "retell", variant: input.storyRetell.nextVariant },
        task_id: null,
      });
    } else {
      items.push({
        type: "story",
        title: input.storyContinue ? `Historia: ${input.storyContinue.title}` : "Nowa historia",
        goal: "Posłuchaj, zrozum i opowiedz historię własnymi słowami.",
        est_minutes: min,
        entry_ids: [],
        grammar_topic_ids: [],
        priority: 65,
        payload: input.storyContinue ? { story_id: input.storyContinue.storyId, mode: "continue" } : { mode: "new" },
        task_id: null,
      });
    }
  };
  if (input.variant === "deep") {
    pushStory(b.story || 4);
    pushGrammar(b.grammar);
  } else if (storySlot) {
    if (preferGrammar && grammarTopic) {
      pushGrammar(b.story);
      rationale.push(`Gramatyka: ${grammarTopic.reason}`);
    } else pushStory(b.story);
  }

  // 4. Conversation — the core of the program. Weekly assessment replaces it once a week.
  if (input.assessmentDue && input.variant !== "quick") {
    items.push({
      type: "assessment",
      title: "Cotygodniowy test rozmowy",
      goal: "10 minut rozmowy bez podpowiedzi i tłumaczeń — sprawdzamy samodzielność.",
      est_minutes: 10,
      entry_ids: [],
      grammar_topic_ids: [],
      priority: 85,
      payload: {},
      task_id: null,
    });
    rationale.push("Minął tydzień — czas na test konwersacyjny.");
    if (input.variant === "deep" && input.conversation) {
      items.push(conversationItem(input, b.conversation - 10 > 2 ? b.conversation - 10 : 3));
    }
  } else if (input.conversation) {
    items.push(conversationItem(input, b.conversation));
    rationale.push(`Rozmowa: ${input.conversation.reason}`);
  }

  if (b.feedback > 0) {
    items.push({
      type: "feedback",
      title: "Podsumowanie dnia",
      goal: "Zobacz, co poszło dobrze, co poprawić i co czeka jutro.",
      est_minutes: b.feedback,
      entry_ids: [],
      grammar_topic_ids: [],
      priority: 40,
      payload: {},
      task_id: null,
    });
  }

  const positioned = items.map((it, i) => ({ ...it, position: i }));
  return {
    targetMinutes: positioned.reduce((s, i) => s + i.est_minutes, 0),
    items: positioned,
    rationale,
    scheduledTaskIds,
  };
}

function conversationItem(input: PlannerInput, minutes: number): Omit<PlanItemDraft, "position"> {
  const c = input.conversation!;
  const sprintTask = input.backlog.find((t) => t.type === "conversation" && t.scenario_id === c.scenarioId);
  return {
    type: "conversation" as PlanItemType,
    title: c.title,
    goal: modeGoal(c.mode),
    est_minutes: minutes,
    entry_ids: [],
    grammar_topic_ids: [],
    priority: 75,
    payload: { scenario_id: c.scenarioId, mode: c.mode },
    task_id: sprintTask?.id ?? null,
  };
}

function modeGoal(mode: "guided" | "natural" | "real_life"): string {
  return {
    guided: "Rozmowa z podpowiedziami — mów jak najwięcej sam, pomoc jest pod ręką.",
    natural: "Naturalna rozmowa — tutor nie poprawia każdego błędu, liczy się komunikacja.",
    real_life: "Symulacja z prawdziwego życia — bez podpowiedzi, jak z Hiszpanem.",
  }[mode];
}
