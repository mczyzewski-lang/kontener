import "server-only";
import type { Session } from "@/lib/session";
import { eq } from "@/lib/db/db";
import { getGrammarTopic, loadContent } from "@/lib/content";
import { applyGrammarResult, getGrammarProgress, pickExercises, syncGrammarUnlocks } from "@/lib/learning/grammar";
import { matchSentence, matchShort, normalize, patternMatches } from "@/lib/learning/text";
import { getPrefs, logEvent } from "@/lib/learning/profile";
import { evaluateAnswer } from "@/lib/ai/tasks";
import { aiProvider } from "@/lib/ai/client";
import { addTask } from "@/lib/learning/intelligence";
import { HttpError } from "@/lib/http-error";

export async function grammarMap(s: Session) {
  const rows = await syncGrammarUnlocks(s.db, s.userId);
  const byId = new Map(rows.map((r) => [r.topic_id, r]));
  return loadContent().grammar.map((t) => {
    const p = byId.get(t.id);
    return {
      id: t.id,
      stage: t.stage,
      title: t.title,
      subtitle: t.subtitle,
      status: p?.status ?? "locked",
      mastery: p?.mastery ?? 0,
      attempts: p?.attempts ?? 0,
      conversationUses: p?.conversation_uses ?? 0,
      conversationErrors: p?.conversation_errors ?? 0,
      nextReviewAt: p?.next_review_at ?? null,
    };
  });
}

export async function grammarLesson(s: Session, topicId: string) {
  const topic = getGrammarTopic(topicId);
  if (!topic) throw new HttpError(404, "Nie ma takiego tematu.");
  const progress = (await getGrammarProgress(s.db, s.userId)).get(topicId);
  if (!progress || progress.status === "locked") {
    const prereq = topic.prerequisites.map((p) => getGrammarTopic(p)?.title).filter(Boolean);
    return { locked: true as const, title: topic.title, prerequisites: prereq };
  }
  return {
    locked: false as const,
    topic: {
      id: topic.id,
      stage: topic.stage,
      title: topic.title,
      subtitle: topic.subtitle,
      explanation: topic.explanation,
      examples: topic.examples,
      mini: topic.mini_conversation,
    },
    // Answers stay on the server; the client only gets what it needs to render.
    exercises: pickExercises(topic, progress.mastery).map((e) => ({
      index: topic.exercises.indexOf(e),
      type: e.type,
      prompt_pl: e.prompt_pl,
      text: e.type === "choice" || e.type === "fill" ? e.sentence : e.type === "translate" ? e.source_pl : e.question_es,
      options: e.type === "choice" ? e.options : null,
    })),
    progress: { status: progress.status, mastery: progress.mastery, attempts: progress.attempts },
  };
}

export async function answerGrammarExercise(
  s: Session,
  topicId: string,
  exerciseIndex: number,
  response: string,
  inputMode: "voice" | "text" | "choice",
) {
  const topic = getGrammarTopic(topicId);
  const ex = topic?.exercises[exerciseIndex];
  if (!topic || !ex) throw new HttpError(404, "Nie ma takiego ćwiczenia.");
  let verdict: "correct" | "minor" | "incorrect";
  let corrected: string | null = null;
  let explanation = ex.explanation_pl;
  let approximate = false;

  if (ex.type === "choice") {
    verdict = normalize(response, true) === normalize(ex.answer, true) ? "correct" : "incorrect";
    corrected = ex.answer;
  } else if (ex.type === "fill") {
    const m = matchShort(response, [ex.answer, ...ex.accepted]);
    verdict = inputMode === "voice" && m.verdict === "minor" ? "correct" : m.verdict;
    corrected = ex.answer;
  } else {
    const refs = ex.type === "translate" ? [ex.answer, ...ex.accepted] : [ex.model_answer];
    const ai = await evaluateAnswer(
      { db: s.db, userId: s.userId, prefs: await getPrefs(s.db, s.userId) },
      {
        task_pl: ex.type === "translate" ? `${ex.prompt_pl} ${ex.source_pl}` : `${ex.prompt_pl} Pytanie: ${ex.question_es}`,
        learner_answer: response,
        reference_answers: refs,
        target_lemma: null,
        construction: `${topic.title}`,
        input_mode: inputMode === "voice" ? "voice" : "text",
      },
    );
    if (ai) {
      verdict = ai.construction_ok === false && ai.verdict === "correct" ? "minor" : ai.verdict;
      corrected = ai.corrected;
      explanation = `${ai.explanation_pl} ${verdict === "correct" ? "" : ex.explanation_pl}`.trim();
    } else if (ex.type === "translate") {
      const m = matchSentence(response, refs);
      verdict = m.verdict;
      corrected = ex.answer;
      approximate = true;
    } else {
      const ok = patternMatches(ex.pattern, response) && response.trim().split(/\s+/).length >= 3;
      verdict = ok ? "minor" : "incorrect";
      corrected = ex.model_answer;
      approximate = true;
      explanation = ok
        ? `Użyłeś ćwiczonej konstrukcji. Bez modelu AI nie sprawdzam reszty zdania. ${ex.explanation_pl}`
        : ex.explanation_pl;
    }
  }
  const score = verdict === "correct" ? 1 : verdict === "minor" ? 0.7 : 0;
  const progress = await applyGrammarResult(s.db, s.userId, { topicId, correct: verdict !== "incorrect", score, source: "exercise" });
  await logEvent(s.db, s.userId, "grammar", { minutes: 0.5, payload: { topic_id: topicId, verdict } });
  return {
    verdict,
    corrected,
    explanation,
    approximate,
    evaluator: approximate ? "rules" : aiProvider() === "mock" ? "test" : ex.type === "choice" || ex.type === "fill" ? "exact" : "ai",
    progress: { status: progress.status, mastery: progress.mastery, attempts: progress.attempts },
  };
}

/** One answer in the lesson's mini-conversation (AI asks, learner answers by voice or text). */
export async function answerMiniConversation(s: Session, topicId: string, qIndex: number, response: string, inputMode: "voice" | "text") {
  const topic = getGrammarTopic(topicId);
  const q = topic?.mini_conversation.questions[qIndex];
  if (!topic || !q) throw new HttpError(404, "Nie ma takiego pytania.");
  const ai = await evaluateAnswer(
    { db: s.db, userId: s.userId, prefs: await getPrefs(s.db, s.userId) },
    {
      task_pl: `Odpowiedz na pytanie w rozmowie: „${q.es}”. Oczekiwana konstrukcja: ${q.expects_pl}`,
      learner_answer: response,
      reference_answers: [q.expects_pl],
      target_lemma: null,
      construction: topic.title,
      input_mode: inputMode,
    },
  );
  let communicated: boolean;
  let constructionOk: boolean;
  let feedback: string;
  let corrected: string | null = null;
  if (ai) {
    communicated = ai.meaning_ok;
    constructionOk = ai.construction_ok ?? ai.verdict !== "incorrect";
    feedback = ai.explanation_pl;
    corrected = ai.corrected;
  } else {
    constructionOk = patternMatches(q.pattern, response);
    communicated = response.trim().split(/\s+/).length >= 2;
    feedback = constructionOk
      ? "Użyłeś oczekiwanej konstrukcji (ocena przybliżona, bez AI)."
      : `Spróbuj użyć: ${q.expects_pl} (ocena przybliżona, bez AI).`;
  }
  const score = communicated && constructionOk ? 1 : communicated ? 0.5 : 0;
  await applyGrammarResult(s.db, s.userId, { topicId, correct: score === 1, score, source: "mini_conversation" });
  return { communicated, constructionOk, feedback, corrected, approximate: !ai };
}

export async function completeLesson(s: Session, topicId: string) {
  const now = new Date().toISOString();
  const p = (await getGrammarProgress(s.db, s.userId)).get(topicId);
  if (!p) throw new HttpError(404, "Temat niedostępny.");
  await s.db.update("grammar_progress", [eq("user_id", s.userId), eq("topic_id", topicId)], { lesson_completed_at: now });
  if (p.mastery < 0.6) {
    await addTask(s.db, s.userId, {
      type: "grammar",
      goal: "Konstrukcja jeszcze nieutrwalona — kolejna porcja ćwiczeń.",
      source: "grammar",
      grammar_topic_ids: [topicId],
      priority: 50,
    });
  }
  await logEvent(s.db, s.userId, "grammar_lesson", { minutes: 1, payload: { topic_id: topicId } });
  return { mastery: p.mastery, status: p.status };
}
