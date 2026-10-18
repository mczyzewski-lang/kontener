import type { Db } from "@/lib/db/db";
import { eq } from "@/lib/db/db";
import type { ConversationSessionRow, ConversationTurnRow, VocabularyEntryRow } from "@/lib/db/types";
import { getScenario } from "@/lib/content";
import { GRAMMAR_TOPIC_IDS } from "@/lib/content/schemas";
import type { ConversationAnalysis } from "@/lib/ai/schemas";
import { recordMissingWord, recordSpeakingEvidence } from "./memory";
import { getEntries, lexiconFor } from "./vocabulary";
import { findEntries, normalize } from "./text";
import { applyGrammarResult } from "./grammar";
import { addTask, upsertMemory } from "./intelligence";
import { logEvent } from "./profile";
import { localDate, weekStart } from "./time";
import { getPrefs } from "./profile";

/**
 * Speaking Engine → Learning Intelligence: turns a finished conversation into
 * feedback and into changes in the shared learner model (reviews, grammar
 * mastery, memory, follow-up tasks).
 */

export interface TurnInput {
  role: "user" | "agent" | "action";
  text: string;
  time_in_call_secs?: number | null;
  action?: string | null;
}

const ASSIST_ACTIONS = new Set(["hint", "translate", "repeat_slower", "not_understood"]);

/** Idempotently stores the transcript; turns right after a hint/translation are flagged as assisted. */
export async function saveTranscript(db: Db, session: ConversationSessionRow, turns: TurnInput[]) {
  let assistedPending = false;
  const rows: Partial<ConversationTurnRow>[] = turns
    .filter((t) => t.text.trim())
    .map((t, idx) => {
      let assisted = false;
      if (t.role === "action") assistedPending = ASSIST_ACTIONS.has(t.action ?? "") && t.action !== "repeat_slower";
      if (t.role === "user") {
        assisted = assistedPending;
        assistedPending = false;
      }
      return {
        session_id: session.id,
        user_id: session.user_id,
        idx,
        role: t.role,
        text: t.text.slice(0, 4000),
        time_in_call_secs: t.time_in_call_secs ?? null,
        action: t.action ?? null,
        assisted,
      };
    });
  await db.remove("conversation_turns", [eq("session_id", session.id)]);
  if (rows.length) await db.insert("conversation_turns", rows);
  return rows.length;
}

const CONTENT_POS = new Set(["v", "n.m", "n.f", "n.mf", "adj", "adv", "phrase"]);

/** Which library entries the learner produced, and whether each use was genuine. */
export function detectUsage(turns: ConversationTurnRow[], entries: VocabularyEntryRow[]) {
  const lex = lexiconFor(entries);
  const byId = new Map(entries.map((e) => [e.id, e]));
  const uses = new Map<string, { spontaneous: boolean; echoed: boolean; assisted: boolean; utterance: string }>();
  let lastAgent = "";
  for (const t of turns) {
    if (t.role === "agent") {
      lastAgent = t.text;
      continue;
    }
    if (t.role !== "user") continue;
    const found = findEntries(t.text, lex);
    const agentFound = findEntries(lastAgent, lex);
    for (const [id] of found) {
      const e = byId.get(id);
      if (!e || !CONTENT_POS.has(e.pos)) continue;
      const echoed = agentFound.has(id);
      const prev = uses.get(id);
      const current = { spontaneous: !echoed && !t.assisted, echoed, assisted: t.assisted, utterance: t.text };
      // Keep the strongest evidence for each word.
      if (!prev || (!prev.spontaneous && current.spontaneous)) uses.set(id, current);
    }
  }
  return uses;
}

export interface AnalysisOutcome {
  analysis: ConversationAnalysis;
  source: "ai" | "basic" | "test";
}

/** Fallback analysis without an LLM: word usage only, clearly marked as limited. */
export function basicAnalysis(turns: ConversationTurnRow[], entries: VocabularyEntryRow[]): ConversationAnalysis {
  const uses = detectUsage(turns, entries);
  const byId = new Map(entries.map((e) => [e.id, e]));
  const userTurns = turns.filter((t) => t.role === "user");
  const words = userTurns.reduce((n, t) => n + t.text.split(/\s+/).length, 0);
  const howDoYouSay = userTurns
    .map((t) => /c[oó]mo se dice ["“«]?([^"”»?]+)/i.exec(t.text)?.[1]?.trim())
    .filter((x): x is string => !!x);
  return {
    summary_pl: `Analiza podstawowa (bez modelu AI): ${userTurns.length} twoich wypowiedzi, ok. ${words} słów. Szczegółowa ocena błędów wymaga skonfigurowania klucza Claude API.`,
    mistakes: [],
    missing_words: howDoYouSay.map((pl) => ({ pl, es: "", lemma: "", context_pl: "Pytanie „¿cómo se dice…?”" })),
    strengths_pl: uses.size ? [`Użyłeś samodzielnie ${[...uses.values()].filter((u) => u.spontaneous).length} słów z biblioteki.`] : [],
    spontaneous_lemmas: [...uses.entries()].filter(([, u]) => u.spontaneous).map(([id]) => byId.get(id)!.lemma),
    grammar_used: [],
    comprehension_issues: [],
    next_exercise: { type: "review", reason_pl: "Utrwal słowa z rozmowy.", grammar_topic_id: null, scenario_id: null },
    scores: { comprehension: 0, fluency: 0, grammar: 0, vocabulary: 0, task_completion: 0 },
    learner_notes: [],
    task_completed: false,
  };
}

/** Applies an analysis to the learner model. Safe to re-run: feedback is upserted. */
export async function applyAnalysis(db: Db, session: ConversationSessionRow, outcome: AnalysisOutcome) {
  const userId = session.user_id;
  const { analysis } = outcome;
  const turns = await db.select("conversation_turns", { where: [eq("session_id", session.id)], order: [{ col: "idx" }] });
  const entries = await getEntries(db, userId);
  const byLemma = new Map<string, VocabularyEntryRow>();
  for (const e of entries) {
    const k = normalize(e.lemma);
    if (!byLemma.has(k) || e.kind === "word") byLemma.set(k, e);
  }
  const alreadyApplied = (await db.count("conversation_feedback", [eq("session_id", session.id)])) > 0;

  await db.upsert("conversation_feedback", {
    session_id: session.id,
    user_id: userId,
    summary: analysis.summary_pl,
    mistakes: analysis.mistakes,
    missing_words: analysis.missing_words,
    strengths: analysis.strengths_pl,
    words_used: analysis.spontaneous_lemmas,
    grammar_used: analysis.grammar_used,
    comprehension_issues: analysis.comprehension_issues,
    next_exercise: analysis.next_exercise,
    scores: outcome.source === "basic" ? null : analysis.scores,
    analysis_source: outcome.source,
  });
  await db.update("conversation_sessions", [eq("id", session.id)], { status: "analyzed" });
  if (alreadyApplied) return; // never double-count evidence when re-analysing

  // 1. Speaking evidence: only words the analysis confirms AND that were not echoed/assisted.
  const confirmed = new Set(analysis.spontaneous_lemmas.map((l) => normalize(l)));
  const uses = detectUsage(turns, entries);
  for (const [entryId, use] of uses) {
    const e = entries.find((x) => x.id === entryId)!;
    const ok = outcome.source === "basic" || confirmed.has(normalize(e.lemma));
    await recordSpeakingEvidence(db, userId, {
      entryId,
      spontaneous: use.spontaneous && ok,
      assisted: use.assisted,
      echoed: use.echoed,
      utterance: use.utterance,
    });
  }

  // 2. Missing words → recall reviews (creating a personal entry when the word is not in the library yet).
  const missingIds: string[] = [];
  for (const m of analysis.missing_words) {
    if (!m.lemma && !m.es) continue;
    const key = normalize(m.lemma || m.es);
    let entry = byLemma.get(key);
    if (!entry && m.es) {
      const id = `u-${key.replace(/[^a-z0-9]+/g, "-").slice(0, 40)}-${userId.slice(0, 8)}`;
      const existing = (await db.select("vocabulary_entries", { where: [eq("id", id)], limit: 1 }))[0];
      entry =
        existing ??
        (
          await db.insert("vocabulary_entries", {
            id,
            owner_id: userId,
            kind: m.es.trim().includes(" ") ? "phrase" : "word",
            lemma: m.lemma || m.es,
            pos: m.es.trim().includes(" ") ? "phrase" : "n.mf",
            translations: [m.pl],
            source: "conversation",
            level: 1,
            difficulty: 2,
          })
        )[0];
      if (!existing) await db.insert("vocabulary_examples", { entry_id: entry.id, position: 0, es: m.es, pl: m.pl });
    }
    if (entry) {
      await recordMissingWord(db, userId, entry.id, "conversation");
      missingIds.push(entry.id);
    }
  }
  if (missingIds.length) {
    await addTask(db, userId, {
      type: "review_words",
      goal: "Słowa, których zabrakło w rozmowie",
      source: "conversation",
      entry_ids: missingIds,
      priority: 75,
    });
  }

  // 3. Grammar evidence from real use.
  const validTopics = new Set<string>(GRAMMAR_TOPIC_IDS);
  for (const g of analysis.grammar_used) {
    if (!validTopics.has(g.topic_id)) continue;
    await applyGrammarResult(db, userId, { topicId: g.topic_id, correct: g.correct, score: g.correct ? 1 : 0, source: "conversation" });
  }
  const majorByTopic = new Map<string, number>();
  for (const m of analysis.mistakes) {
    const key = m.grammar_topic_id && validTopics.has(m.grammar_topic_id) ? m.grammar_topic_id : m.category;
    await upsertMemory(db, userId, "error_pattern", key, `${m.original} → ${m.corrected} (${m.explanation_pl})`, m.severity === "major" ? 2 : 1);
    if (m.grammar_topic_id && validTopics.has(m.grammar_topic_id) && m.severity === "major") {
      majorByTopic.set(m.grammar_topic_id, (majorByTopic.get(m.grammar_topic_id) ?? 0) + 1);
    }
  }
  for (const [topicId, n] of majorByTopic) {
    await addTask(db, userId, {
      type: "grammar",
      goal: "W rozmowie pojawiły się błędy w tej konstrukcji — krótka powtórka.",
      source: "conversation",
      grammar_topic_ids: [topicId],
      priority: Math.min(95, 60 + n * 10),
    });
  }

  // 4. Memory: comprehension issues, notes, strengths.
  for (const c of analysis.comprehension_issues) {
    await upsertMemory(db, userId, "comprehension_issue", normalize(c.agent_text).slice(0, 40), `${c.agent_text} — ${c.note_pl}`);
  }
  for (const n of analysis.learner_notes) await upsertMemory(db, userId, n.kind, n.key, n.content);
  for (const s of analysis.strengths_pl.slice(0, 2)) await upsertMemory(db, userId, "strength", normalize(s).slice(0, 40), s, 0.5);

  // 5. Next exercise suggestion becomes a backlog task.
  const nx = analysis.next_exercise;
  if (nx.type === "conversation" && nx.scenario_id && getScenario(nx.scenario_id)) {
    await addTask(db, userId, { type: "conversation", goal: nx.reason_pl, source: "conversation", scenario_id: nx.scenario_id, priority: 55 });
  }

  // 6. Scenario mastery (only from real, unassisted modes).
  const avg = (Object.values(analysis.scores) as number[]).reduce((a, b) => a + b, 0) / 5;
  if (session.scenario_id && outcome.source !== "basic" && analysis.task_completed && avg >= 4 && session.hints_used === 0 && (session.mode === "natural" || session.mode === "real_life")) {
    await upsertMemory(db, userId, "mastered_scenario", session.scenario_id, `Opanowany scenariusz: ${getScenario(session.scenario_id)?.title ?? session.scenario_id}`);
  }

  // 7. Weekly assessment record.
  if (session.mode === "assessment" && outcome.source !== "basic") {
    const prefs = await getPrefs(db, userId);
    const ws = weekStart(localDate(prefs.timezone, new Date(session.started_at)));
    await db.upsert(
      "weekly_assessments",
      {
        user_id: userId,
        week_start: ws,
        session_id: session.id,
        scores: analysis.scores,
        report: {
          summary_pl: analysis.summary_pl,
          strengths_pl: analysis.strengths_pl,
          areas_pl: analysis.mistakes.slice(0, 5).map((m) => `${m.corrected} — ${m.explanation_pl}`),
          missing_words: analysis.missing_words.map((m) => `${m.es} (${m.pl})`),
          task_completed: analysis.task_completed,
          disclaimer: "Przybliżona ocena AI według stałych kryteriów Hablo — nie jest to certyfikowany test CEFR.",
        },
      },
      { onConflict: ["user_id", "week_start"] },
    );
  }

  const minutes = (session.duration_secs ?? 0) / 60;
  await logEvent(db, userId, session.mode === "assessment" ? "assessment" : "conversation", {
    minutes,
    payload: { session_id: session.id, scenario_id: session.scenario_id, channel: session.channel },
  });
}

/** Rough share of the conversation spoken by the learner (seconds), from turn timestamps. */
export function estimateUserSpeakingSecs(turns: TurnInput[]): number {
  let secs = 0;
  for (let i = 0; i < turns.length; i++) {
    const t = turns[i];
    if (t.role !== "user") continue;
    const words = t.text.split(/\s+/).filter(Boolean).length;
    secs += words / 2; // ~2 words/second for a learner
  }
  return Math.round(secs);
}
