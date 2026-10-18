import "server-only";
import type { Session } from "@/lib/session";
import { eq } from "@/lib/db/db";
import type { StartLevel } from "@/lib/db/types";
import { claimKnown } from "@/lib/learning/memory";
import { getEntries } from "@/lib/learning/vocabulary";
import { stagesOpenForLevel, syncGrammarUnlocks } from "@/lib/learning/grammar";
import { getOrCreateTodayPlan, getPlan } from "@/lib/learning/plan-service";
import { localDate } from "@/lib/learning/time";
import { upsertMemory } from "@/lib/learning/intelligence";
import { getPrefs, logEvent } from "@/lib/learning/profile";
import { patternMatches } from "@/lib/learning/text";
import { evaluateAnswer } from "@/lib/ai/tasks";
import { SITUATIONS } from "@/lib/learning/situations";
import { HttpError } from "@/lib/http-error";

/** Frequency bands sampled by the placement test. */
export const BANDS = [
  { max: 60, label: "1–60" },
  { max: 150, label: "61–150" },
  { max: 300, label: "151–300" },
  { max: 600, label: "301–600" },
  { max: 100000, label: "600+" },
];
const PER_BAND = 6;

export const COMMUNICATION_PROMPTS = [
  { id: "intro", pl: "Przedstaw się: jak masz na imię, skąd jesteś i gdzie mieszkasz.", pattern: "(me llamo|soy|vivo)", construction: "presente" },
  { id: "order", pl: "Jesteś w barze. Zamów kawę z mlekiem i zapytaj o cenę.", pattern: "(cafe|quiero|me pone|quisiera|cuanto)", construction: "pedir en un bar" },
  { id: "past", pl: "Opowiedz w 2 zdaniach, co robiłeś wczoraj.", pattern: "\\b(fui|estuve|hice|trabaje|comi|vi|sali|[a-z]{3,}(e|aste|o|amos|aron|i|io|imos|ieron))\\b", construction: "pretérito indefinido" },
] as const;

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export async function placementTest(s: Session) {
  const entries = (await getEntries(s.db, s.userId)).filter((e) => e.kind === "word" && e.frequency_rank && !/^[A-ZÁÉÍÓÚ]/.test(e.lemma));
  const sorted = entries.sort((a, b) => a.frequency_rank! - b.frequency_rank!);
  const items: { entryId: string; lemma: string; band: number; options: string[] }[] = [];
  let lower = 0;
  BANDS.forEach((band, bi) => {
    const pool = sorted.filter((e) => e.frequency_rank! > lower && e.frequency_rank! <= band.max && ["v", "n.m", "n.f", "adj", "adv"].includes(e.pos));
    lower = band.max;
    const step = Math.max(1, Math.floor(pool.length / PER_BAND));
    for (let i = 0; i < PER_BAND && i * step < pool.length; i++) {
      const e = pool[i * step];
      const others = sorted.filter((o) => o.pos === e.pos && o.id !== e.id);
      const distract = [0, 1, 2].map((k) => others[(hash(e.id) + k * 7) % others.length].translations[0]);
      const options = [e.translations[0], ...distract].sort((a, b) => hash(a + e.id) - hash(b + e.id));
      items.push({ entryId: e.id, lemma: e.lemma, band: bi, options: [...options, "Nie wiem"] });
    }
  });
  return { bands: BANDS.map((b) => b.label), items, communication: COMMUNICATION_PROMPTS.map(({ id, pl }) => ({ id, pl })) };
}

export interface OnboardingInput {
  level: StartLevel;
  dailyMinutes: number;
  motivation: string;
  situations: string[];
  interests: string[];
  timezone: string;
  displayName: string | null;
  placement: { entryId: string; answer: string }[] | null;
  communication: { id: string; text: string; inputMode: "voice" | "text" }[] | null;
}

export async function completeOnboarding(s: Session, input: OnboardingInput) {
  const entries = await getEntries(s.db, s.userId);
  const byId = new Map(entries.map((e) => [e.id, e]));
  const validSituations = input.situations.filter((x) => SITUATIONS.some((s2) => s2.id === x));
  const variant = input.dailyMinutes <= 15 ? "quick" : input.dailyMinutes >= 45 ? "deep" : "standard";
  try {
    Intl.DateTimeFormat("en", { timeZone: input.timezone });
  } catch {
    throw new HttpError(400, "Nieprawidłowa strefa czasowa.");
  }
  await getPrefs(s.db, s.userId);
  await s.db.update("learning_preferences", [eq("user_id", s.userId)], {
    daily_minutes: Math.max(10, Math.min(90, Math.round(input.dailyMinutes))),
    plan_variant: variant,
    motivation: input.motivation.slice(0, 500) || null,
    focus_situations: validSituations,
    interests: input.interests.map((i) => i.slice(0, 40)).slice(0, 10),
    timezone: input.timezone,
    updated_at: new Date().toISOString(),
  });

  // Placement: claim whole frequency bands the learner clearly knows (>= 5/6),
  // stopping at the first band below that. Claims are verified later by reviews.
  let level = input.level;
  let claimed = 0;
  const report: { band: string; correct: number; total: number }[] = [];
  if (input.placement?.length) {
    const perBand = BANDS.map(() => ({ correct: 0, total: 0 }));
    const bandOf = (rank: number) => BANDS.findIndex((b) => rank <= b.max);
    for (const a of input.placement) {
      const e = byId.get(a.entryId);
      if (!e?.frequency_rank) continue;
      const b = bandOf(e.frequency_rank);
      perBand[b].total++;
      if (a.answer === e.translations[0]) perBand[b].correct++;
    }
    let knownUpTo = 0;
    for (let i = 0; i < BANDS.length; i++) {
      report.push({ band: BANDS[i].label, ...perBand[i] });
      // A band counts as known only with a real sample (>= 4 answers) and >= 80% correct.
      if (perBand[i].total >= 4 && perBand[i].correct / perBand[i].total >= 0.8) knownUpTo = BANDS[i].max;
      else break;
    }
    if (knownUpTo > 0) {
      const wrong = new Set(input.placement.filter((a) => byId.get(a.entryId)?.translations[0] !== a.answer).map((a) => a.entryId));
      const ids = entries
        .filter((e) => e.kind === "word" && (e.frequency_rank ?? 1e9) <= knownUpTo && !wrong.has(e.id))
        .map((e) => e.id);
      claimed = await claimKnown(s.db, s.userId, ids, { spreadDays: 21 });
    }
    if (level === "unknown") {
      level = knownUpTo >= 600 ? "intermediate" : knownUpTo >= 150 ? "elementary" : "beginner";
    }
  }

  // No test: trust the self-reported level only as far as the most frequent words,
  // and verify those claims in reviews over the next weeks ("don't assume zero").
  if (!input.placement?.length && level !== "unknown" && level !== "beginner") {
    const upTo = { elementary: 150, intermediate: 600, advanced: 1000 }[level];
    const ids = entries.filter((e) => e.kind === "word" && (e.frequency_rank ?? 1e9) <= upTo).map((e) => e.id);
    claimed = await claimKnown(s.db, s.userId, ids, { spreadDays: 21 });
  }

  // Communication check: can the learner already produce simple sentences?
  const comm: { id: string; ok: boolean; feedback: string }[] = [];
  if (input.communication?.length) {
    const prefs = await getPrefs(s.db, s.userId);
    for (const c of input.communication) {
      const p = COMMUNICATION_PROMPTS.find((x) => x.id === c.id);
      if (!p || !c.text.trim()) continue;
      const ai = await evaluateAnswer(
        { db: s.db, userId: s.userId, prefs },
        { task_pl: p.pl, learner_answer: c.text, reference_answers: [], target_lemma: null, construction: p.construction, input_mode: c.inputMode },
      );
      const ok = ai ? ai.meaning_ok && ai.verdict !== "incorrect" : patternMatches(p.pattern, c.text);
      comm.push({ id: c.id, ok, feedback: ai?.explanation_pl ?? (ok ? "Wygląda dobrze (ocena przybliżona)." : "Tu będziemy ćwiczyć.") });
    }
    const okCount = comm.filter((c) => c.ok).length;
    if (level === "beginner" && okCount >= 2) level = "elementary";
    if (level === "elementary" && comm.find((c) => c.id === "past")?.ok && okCount === 3) level = "intermediate";
  }
  if (level === "unknown") level = "beginner";

  await syncGrammarUnlocks(s.db, s.userId, stagesOpenForLevel(level));
  await s.db.update("profiles", [eq("id", s.userId)], {
    start_level: level,
    onboarded_at: new Date().toISOString(),
    display_name: input.displayName?.slice(0, 40) || null,
  });
  if (input.motivation.trim()) await upsertMemory(s.db, s.userId, "goal", "motivation", input.motivation.trim());
  for (const i of input.interests) await upsertMemory(s.db, s.userId, "interest", i, `Interesuje się: ${i}`);
  await logEvent(s.db, s.userId, "onboarding", { minutes: 3 });
  // A plan built before onboarding (e.g. a parallel page render) is rebuilt with the new profile.
  const today = await getPlan(s.db, s.userId, localDate(input.timezone));
  if (today && today.items.every((i) => i.status === "pending")) {
    await s.db.remove("daily_plan_items", [eq("plan_id", today.plan.id)]);
    await s.db.remove("daily_plans", [eq("id", today.plan.id)]);
  }
  const plan = await getOrCreateTodayPlan(s.db, s.userId);
  return { level, claimed, placement: report, communication: comm, planItems: plan.items.length };
}
