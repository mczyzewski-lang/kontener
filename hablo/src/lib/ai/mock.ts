import type { AiTask } from "./client";
import { matchSentence, normalize } from "@/lib/learning/text";

/**
 * Deterministic stand-in for the AI provider, enabled ONLY with HABLO_AI_MOCK=1
 * (automated tests). The UI labels every result produced in this mode as
 * "TEST", so it can never be mistaken for real evaluation.
 */
type Any = Record<string, unknown>;

export function mockResponse(task: AiTask, raw: unknown): unknown {
  const input = (raw ?? {}) as Any;
  switch (task) {
    case "evaluate_answer": {
      const refs = (input.reference_answers as string[]) ?? [];
      const m = matchSentence(String(input.learner_answer ?? ""), refs);
      return {
        verdict: m.verdict,
        meaning_ok: m.verdict !== "incorrect",
        construction_ok: input.construction ? m.verdict !== "incorrect" : null,
        used_target: input.target_lemma
          ? normalize(String(input.learner_answer)).includes(normalize(String(input.target_lemma)).slice(0, 4))
          : true,
        corrected: m.best,
        explanation_pl: "[TEST] Ocena wygenerowana w trybie testowym.",
      };
    }
    case "generate_story":
    case "transform_story": {
      const targets = ((input.target_words as { lemma: string; pl: string }[]) ?? []).map((t) => t.lemma);
      const lemmas = targets.length ? targets : ["casa", "comer"];
      return {
        title: `[TEST] Historia ${lemmas.slice(0, 2).join(" y ")}`,
        sentences: [
          { es: `Hoy uso la palabra ${lemmas[0]}.`, pl: `Dziś używam słowa ${lemmas[0]}.` },
          { es: "Mi vecino Paco está en casa.", pl: "Mój sąsiad Paco jest w domu." },
          { es: "Vamos a comer juntos.", pl: "Zjemy razem." },
        ],
        glossary: [],
        questions: [
          { q_es: "¿Dónde está Paco?", q_pl: "Gdzie jest Paco?", answer_es: "En casa.", keywords: ["casa"] },
          { q_es: "¿Qué van a hacer?", q_pl: "Co zrobią?", answer_es: "Comer juntos.", keywords: ["comer"] },
        ],
        used_target_lemmas: lemmas,
      };
    }
    case "evaluate_retell": {
      const text = normalize(String(input.learner_text ?? ""));
      const targets = (input.target_lemmas as string[]) ?? [];
      const used = targets.filter((t) => text.includes(normalize(t).slice(0, 4)));
      return {
        summary_pl: "[TEST] Podsumowanie w trybie testowym.",
        score: targets.length ? used.length / targets.length : 0.5,
        covered_events: used.length,
        total_events: Math.max(1, targets.length),
        used_target_lemmas: used,
        missing_target_lemmas: targets.filter((t) => !used.includes(t)),
        mistakes: [],
        strengths_pl: ["[TEST] Mocna strona."],
      };
    }
    case "analyze_conversation": {
      const transcript = (input.transcript as { role: string; text: string; assisted: boolean }[]) ?? [];
      const userTurns = transcript.filter((t) => t.role === "user");
      return {
        summary_pl: `[TEST] Analiza testowa: ${userTurns.length} wypowiedzi.`,
        mistakes: [
          {
            original: "yo soy cansado",
            corrected: "estoy cansado",
            explanation_pl: "[TEST] Stan → estar.",
            category: "grammar",
            severity: "major",
            grammar_topic_id: "g03-ser-estar",
          },
        ],
        missing_words: [{ pl: "klucz", es: "llave", lemma: "llave", context_pl: "[TEST]" }],
        strengths_pl: ["[TEST] Odpowiadasz pełnymi zdaniami."],
        spontaneous_lemmas: ["querer", "casa"],
        grammar_used: [{ topic_id: "g02-present", correct: true, example: userTurns[0]?.text ?? "" }],
        comprehension_issues: [],
        next_exercise: { type: "grammar", reason_pl: "[TEST] Powtórz ser/estar.", grammar_topic_id: "g03-ser-estar", scenario_id: null },
        scores: { comprehension: 4, fluency: 3, grammar: 3, vocabulary: 3, task_completion: 4 },
        learner_notes: [{ kind: "interest", key: "test_interest", content: "[TEST] Lubi plażę." }],
        task_completed: true,
      };
    }
    case "mnemonic":
      return { scene_pl: `[TEST] Wyobraź sobie słowo „${String(input.lemma)}” na wielkim billboardzie.`, sound_link_pl: "[TEST]" };
    case "plan_sprint": {
      const scenarios = (input.scenarios as { id: string }[]) ?? [];
      const phrases = (input.phrases as { id: string }[]) ?? [];
      return {
        summary_pl: "[TEST] Plan sprintu.",
        days: 7,
        scenario_ids: scenarios.slice(0, 2).map((s) => s.id),
        phrase_ids: phrases.slice(0, 4).map((p) => p.id),
        focus_lemmas: ["mesa", "cuenta"],
      };
    }
    case "translate":
      return { pl: `[TEST] tłumaczenie: ${String(input.es ?? "")}` };
    case "tutor_reply": {
      const history = (input.history as { role: string }[]) ?? [];
      return {
        reply_es: history.length > 6 ? "Muy bien. ¡Hasta luego!" : "¿Y qué más me cuentas?",
        translation_pl: history.length > 6 ? "Bardzo dobrze. Na razie!" : "A co jeszcze mi opowiesz?",
        end_conversation: history.length > 6,
      };
    }
  }
}
