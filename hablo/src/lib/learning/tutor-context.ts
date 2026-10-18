import type { Db } from "@/lib/db/db";
import type { ConversationMode, LearningPreferencesRow } from "@/lib/db/types";
import { getGrammarTopic, getScenario, loadContent } from "@/lib/content";
import { competence, getDueCards } from "./memory";
import { getEntries, getProgress } from "./vocabulary";
import { getMemory, memoryForTutor } from "./intelligence";
import { getGrammarProgress } from "./grammar";
import { getProfile } from "./profile";

/**
 * Builds the learner context sent to the ElevenLabs agent as dynamic
 * variables. The agent's base prompt (scripts/elevenlabs/agent-config.ts)
 * references these variables, so no client-side prompt override is needed.
 */

export const MODE_RULES: Record<ConversationMode, string> = {
  guided: `MODO GUIADO (principiante):
- Habla despacio, con frases cortas (máx. 12 palabras) y vocabulario de la lista de palabras conocidas.
- Haz UNA pregunta cada vez y espera. Tolera pausas largas: no respondas por el alumno.
- Si el alumno no responde o dice que no entiende, repite más despacio y más simple; si sigue sin entender, da la traducción al polaco de la pregunta y vuelve al español.
- Puedes ofrecer el inicio de una respuesta ("Puedes decir: Me gusta...") cuando lo pida o se bloquee.
- Corrige solo errores que impidan entender, repitiendo la frase bien de forma natural (recast), sin explicaciones largas.`,
  natural: `MODO NATURAL:
- Habla con naturalidad a velocidad moderada, adaptando la dificultad al alumno.
- No corrijas cada error: prioriza que la conversación fluya. Como mucho, reformula de forma natural (recast).
- Haz preguntas abiertas y de seguimiento para que el alumno hable más que tú.
- Da pistas solo si el alumno las pide explícitamente.`,
  real_life: `MODO VIDA REAL:
- Interpreta al personaje como un hablante nativo real de España: ritmo natural, expresiones coloquiales frecuentes.
- No des pistas, ni traducciones, ni correcciones. No digas que eres profesor. Si no te entiende, reformula como lo haría una persona real.
- Mantén el objetivo de la situación (la otra persona también tiene intereses).`,
  assessment: `MODO EVALUACIÓN SEMANAL (10 minutos):
- Eres un examinador amable. No des pistas, traducciones ni correcciones, y no ayudes a construir respuestas.
- Recorre 3 partes: (1) preguntas personales conocidas, (2) una situación práctica familiar (p. ej. pedir algo, resolver un problema), (3) una situación nueva que el alumno no ha practicado.
- Ajusta la dificultad al nivel del alumno; si responde bien, sube un poco el nivel.
- Usa preguntas abiertas que obliguen a responder con varias frases.`,
  grammar: `MODO PRÁCTICA DE GRAMÁTICA:
- Conversa de forma natural pero crea muchas ocasiones para que el alumno use la construcción objetivo.
- Si la usa mal, reformula su frase correctamente una vez (recast) y sigue la conversación.
- Varía las preguntas para que use la construcción con distintos verbos y personas.`,
};

export interface TutorSessionInput {
  mode: ConversationMode;
  scenarioId: string | null;
  grammarTopicId: string | null;
}

export async function buildTutorContext(db: Db, userId: string, prefs: LearningPreferencesRow, input: TutorSessionInput) {
  const [entries, progress, memory, grammar, profile] = await Promise.all([
    getEntries(db, userId),
    getProgress(db, userId),
    getMemory(db, userId),
    getGrammarProgress(db, userId),
    getProfile(db, userId),
  ]);
  const byId = new Map(entries.map((e) => [e.id, e]));
  const recallRows = progress.filter((p) => p.skill === "recall");
  const known = recallRows
    .filter((p) => competence(p) !== "none")
    .map((p) => byId.get(p.entry_id))
    .filter((e) => e && e.kind === "word")
    .sort((a, b) => (a!.frequency_rank ?? 1e6) - (b!.frequency_rank ?? 1e6))
    .slice(0, 120)
    .map((e) => e!.lemma);
  const due = (await getDueCards(db, userId, new Date(), 40))
    .map((p) => byId.get(p.entry_id))
    .filter((e) => !!e)
    .map((e) => `${e!.lemma} (${e!.translations[0]})`);
  const reviewWords = [...new Set(due)].slice(0, 12);
  const grammarKnown = loadContent()
    .grammar.filter((g) => {
      const p = grammar.get(g.id);
      return p && (p.status === "practiced" || p.status === "mastered" || p.status === "learning");
    })
    .map((g) => g.title);
  const scenario = input.scenarioId ? getScenario(input.scenarioId) : null;
  const topic = input.grammarTopicId ? getGrammarTopic(input.grammarTopicId) : null;
  const mem = memoryForTutor(memory);

  const persona = scenario
    ? `Eres ${scenario.character_name}, ${scenario.character_role}. ${scenario.persona}\nSituación: ${scenario.situation_es}`
    : input.mode === "assessment"
      ? "Eres Lucía, examinadora de español de Madrid, amable y profesional."
      : "Eres Lucía, una profesora de español de Madrid, cercana, paciente y con sentido del humor. Conversas sobre la vida del alumno, sus planes y temas que le interesen.";
  const goals = scenario
    ? scenario.goals_pl.join("; ")
    : topic
      ? `Practicar: ${topic.title}. ${topic.agent_focus}`
      : input.mode === "assessment"
        ? "Evaluar la comunicación independiente del alumno."
        : "Conversación libre: que el alumno hable lo máximo posible de su vida, sus planes y sus intereses.";
  const firstMessage =
    scenario?.first_message ??
    (input.mode === "assessment"
      ? "Hola, soy Lucía. Hoy vamos a charlar unos diez minutos para ver cómo va tu español. ¿Empezamos? Cuéntame, ¿qué tal tu semana?"
      : topic
        ? topic.mini_conversation.questions[0].es
        : "¡Hola! ¿Qué tal? Cuéntame, ¿qué has hecho hoy?");

  const level = profile?.start_level ?? "unknown";
  return {
    persona,
    firstMessage,
    scenario,
    topic,
    dynamicVariables: {
      persona,
      mode_rules: MODE_RULES[input.mode],
      session_goals: goals,
      first_message: firstMessage,
      learner_level: `${levelLabel(level)}; palabras activas: ${known.length}`,
      known_words: known.join(", ") || "(todavía muy pocas: usa palabras básicas y frecuentes)",
      review_words: reviewWords.join(", ") || "(ninguna)",
      grammar_known: grammarKnown.join("; ") || "frases simples en presente",
      grammar_focus: topic ? `${topic.title}: ${topic.agent_focus}` : "ninguna en particular",
      learner_memory: mem.facts.join(" | ") || "(aún no hay datos)",
      typical_errors: mem.errors.join(" | ") || "(aún no hay datos)",
      speaking_pace: prefs.tutor_speed < 0.9 ? "lento" : prefs.tutor_speed > 1.05 ? "natural" : "algo más lento de lo normal",
      hints_allowed: input.mode === "guided" ? "sí" : input.mode === "natural" ? "solo si las pide" : "no",
    } satisfies Record<string, string>,
  };
}

function levelLabel(level: string): string {
  return (
    {
      unknown: "nivel inicial (sin evaluar)",
      beginner: "principiante (A1)",
      elementary: "elemental (A2)",
      intermediate: "intermedio (B1)",
      advanced: "intermedio alto (B2)",
    } as Record<string, string>
  )[level] ?? level;
}
