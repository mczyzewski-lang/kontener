import "server-only";
import type { Session } from "@/lib/session";
import { eq, gte } from "@/lib/db/db";
import type { ConversationFeedbackRow, ConversationSessionRow, ConversationTurnRow } from "@/lib/db/types";
import { computeVocabStats } from "@/lib/learning/memory";
import { getProgress } from "@/lib/learning/vocabulary";
import { getGrammarProgress, nextGrammarTopic } from "@/lib/learning/grammar";
import { getMemory } from "@/lib/learning/intelligence";
import { getPrefs, getProfile, streak } from "@/lib/learning/profile";
import { addDays, localDate, weekStart } from "@/lib/learning/time";
import { loadContent } from "@/lib/content";

export const VOCAB_GOAL = 5000;

/**
 * North Star: minutes of real, independent and understandable communication.
 * Per session: duration × share of the learner's turns produced without help
 * × comprehensibility (AI comprehension+fluency scores; 0.5 when only the
 * basic analysis is available, flagged as approximate).
 */
export function independentMinutes(
  s: Pick<ConversationSessionRow, "duration_secs">,
  turns: Pick<ConversationTurnRow, "role" | "assisted">[],
  fb: Pick<ConversationFeedbackRow, "scores" | "analysis_source"> | null,
): { minutes: number; approximate: boolean } {
  const user = turns.filter((t) => t.role === "user");
  if (!user.length || !s.duration_secs) return { minutes: 0, approximate: false };
  const independence = user.filter((t) => !t.assisted).length / user.length;
  const scores = fb?.scores as { comprehension?: number; fluency?: number } | null;
  const comprehensible =
    scores && typeof scores.comprehension === "number" && typeof scores.fluency === "number" && scores.comprehension > 0
      ? (scores.comprehension + scores.fluency) / 10
      : 0.5;
  return {
    minutes: Math.round(((s.duration_secs / 60) * independence * comprehensible) * 10) / 10,
    approximate: !scores || fb?.analysis_source === "basic",
  };
}

export function levelBand(mastered: number) {
  const level = Math.min(5, Math.floor(mastered / 1000) + 1);
  const names = ["Podstawowa komunikacja", "Codzienne życie", "Rozmowy towarzyskie i historie", "Opinie i rozwiązywanie problemów", "Bogate rozmowy o życiu i biznesie"];
  return { level, name: names[level - 1], from: (level - 1) * 1000, to: level * 1000 };
}

export async function homeStats(s: Session) {
  const prefs = await getPrefs(s.db, s.userId);
  const today = localDate(prefs.timezone);
  const progress = await getProgress(s.db, s.userId);
  const vocab = computeVocabStats(progress);
  const events = await s.db.select("learning_events", { where: [eq("user_id", s.userId)] });
  const activeDates = new Set(events.map((e) => e.local_date));
  const ws = weekStart(today);
  const weekSessions = await s.db.select("conversation_sessions", {
    where: [eq("user_id", s.userId), gte("started_at", new Date(`${ws}T00:00:00Z`).toISOString())],
  });
  const convMinutesWeek = Math.round(weekSessions.reduce((a, x) => a + (x.duration_secs ?? 0), 0) / 60);
  const grammar = [...(await getGrammarProgress(s.db, s.userId)).values()];
  const currentStage = loadContent().grammar.filter((g) => grammar.find((p) => p.topic_id === g.id && p.status !== "locked")).at(-1);
  return {
    day: activeDates.size + (activeDates.has(today) ? 0 : 1),
    streak: streak(activeDates, today),
    mastered: vocab.mastered,
    spoken: vocab.spoken,
    recalled: vocab.recalled,
    recognized: vocab.recognized,
    due: vocab.dueTotal,
    seen: vocab.seen,
    convMinutesWeek,
    band: levelBand(vocab.mastered),
    grammarStage: currentStage ? { stage: currentStage.stage, title: currentStage.title } : null,
  };
}

export async function progressStats(s: Session) {
  const prefs = await getPrefs(s.db, s.userId);
  const profile = await getProfile(s.db, s.userId);
  const today = localDate(prefs.timezone);
  const progress = await getProgress(s.db, s.userId);
  const vocab = computeVocabStats(progress);
  const events = await s.db.select("learning_events", { where: [eq("user_id", s.userId), gte("local_date", addDays(today, -60))] });
  const allEvents = await s.db.count("learning_events", [eq("user_id", s.userId)]);
  const sessions = await s.db.select("conversation_sessions", { where: [eq("user_id", s.userId)], order: [{ col: "started_at", asc: false }] });
  const feedback = await s.db.select("conversation_feedback", { where: [eq("user_id", s.userId)] });
  const fbBy = new Map(feedback.map((f) => [f.session_id, f]));
  const turns = await s.db.select("conversation_turns", { where: [eq("user_id", s.userId)] });
  const turnsBy = new Map<string, ConversationTurnRow[]>();
  for (const t of turns) {
    if (!turnsBy.has(t.session_id)) turnsBy.set(t.session_id, []);
    turnsBy.get(t.session_id)!.push(t);
  }
  let northStar = 0;
  let northStarApprox = false;
  const northStarByDate = new Map<string, number>();
  for (const sess of sessions) {
    const r = independentMinutes(sess, turnsBy.get(sess.id) ?? [], fbBy.get(sess.id) ?? null);
    northStar += r.minutes;
    northStarApprox ||= r.approximate && r.minutes > 0;
    const d = localDate(prefs.timezone, new Date(sess.started_at));
    northStarByDate.set(d, (northStarByDate.get(d) ?? 0) + r.minutes);
  }

  // 30-day chart
  const reviewLogs = await s.db.select("vocabulary_review_logs", {
    where: [eq("user_id", s.userId), gte("reviewed_at", new Date(Date.now() - 31 * 86_400_000).toISOString())],
  });
  const days: { date: string; minutes: number; reviews: number; newWords: number; independent: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const date = addDays(today, -i);
    const dayEvents = events.filter((e) => e.local_date === date);
    const dayLogs = reviewLogs.filter((l) => localDate(prefs.timezone, new Date(l.reviewed_at)) === date);
    days.push({
      date,
      minutes: Math.round(dayEvents.reduce((a, e) => a + e.minutes, 0)),
      reviews: dayLogs.filter((l) => l.source !== "new_words").length,
      newWords: new Set(dayLogs.filter((l) => l.source === "new_words").map((l) => l.entry_id)).size,
      independent: Math.round((northStarByDate.get(date) ?? 0) * 10) / 10,
    });
  }
  const activeDates = new Set(events.map((e) => e.local_date));

  const grammarRows = await getGrammarProgress(s.db, s.userId);
  const grammar = loadContent().grammar.map((g) => {
    const p = grammarRows.get(g.id);
    return { id: g.id, stage: g.stage, title: g.title, status: p?.status ?? "locked", mastery: p?.mastery ?? 0 };
  });
  const assessments = await s.db.select("weekly_assessments", { where: [eq("user_id", s.userId)], order: [{ col: "week_start", asc: false }] });
  const memory = await getMemory(s.db, s.userId);
  const problems = memory.filter((m) => m.kind === "error_pattern" || m.kind === "weak_construction").slice(0, 6);
  const strengths = memory.filter((m) => m.kind === "strength").slice(0, 3);
  const next = nextGrammarTopic([...grammarRows.values()]);
  const weakTopic = grammar.filter((g) => g.status === "learning").sort((a, b) => a.mastery - b.mastery)[0];
  const direction: string[] = [];
  if (vocab.dueTotal > 30) direction.push(`Najpierw nadrób ${vocab.dueTotal} zaległych powtórek — to najszybszy zysk.`);
  if (next) direction.push(`Gramatyka: ${loadContent().grammar.find((g) => g.id === next.topicId)?.title} — ${next.reason}`);
  if (weakTopic && weakTopic.id !== next?.topicId) direction.push(`Słaba konstrukcja: ${weakTopic.title} (${Math.round(weakTopic.mastery * 100)}%).`);
  if (vocab.spoken < vocab.recalled / 3) direction.push("Znasz więcej słów, niż używasz. Więcej rozmów w trybie naturalnym przeniesie je do mowy.");
  if (!direction.length) direction.push("Utrzymuj rytm: codzienne powtórki i 10 minut rozmowy.");

  return {
    startedAt: profile?.onboarded_at ?? profile?.created_at ?? null,
    vocab: { ...vocab, goal: VOCAB_GOAL, band: levelBand(vocab.mastered) },
    conversation: {
      totalMinutes: Math.round(sessions.reduce((a, x) => a + (x.duration_secs ?? 0), 0) / 60),
      sessions: sessions.length,
      independentMinutes: Math.round(northStar * 10) / 10,
      independentApprox: northStarApprox,
    },
    activity: { streak: streak(activeDates, today), activeDays30: days.filter((d) => activeDates.has(d.date)).length, totalEvents: allEvents },
    days,
    grammar,
    assessments: assessments.map((a) => ({ weekStart: a.week_start, scores: a.scores, report: a.report, sessionId: a.session_id })),
    problems: problems.map((p) => ({ content: p.content, count: p.evidence_count })),
    strengths: strengths.map((p) => p.content),
    direction,
  };
}
