import "server-only";
import type { Db } from "@/lib/db/db";
import type { LearningPreferencesRow } from "@/lib/db/types";
import { structured } from "./client";
import {
  answerEvaluationSchema,
  conversationAnalysisSchema,
  generatedStorySchema,
  mnemonicSchema,
  retellEvaluationSchema,
  sprintPlanSchema,
  tutorReplySchema,
  translationSchema,
} from "./schemas";

export interface AiCtx {
  db: Db;
  userId: string;
  prefs: LearningPreferencesRow | null;
}

export function evaluateAnswer(
  ctx: AiCtx,
  input: {
    task_pl: string;
    learner_answer: string;
    reference_answers: string[];
    target_lemma: string | null;
    construction: string | null;
    input_mode: "voice" | "text";
  },
) {
  return structured({
    ...ctx,
    task: "evaluate_answer",
    schema: answerEvaluationSchema,
    effort: "low",
    maxTokens: 2000,
    input,
    instructions: `Tarea: evalúa la respuesta del alumno a un ejercicio.
- "correct": transmite el significado pedido de forma natural y gramaticalmente correcta (puede ser distinta de las respuestas de referencia).
- "minor": se entiende y el significado es correcto, pero hay un fallo pequeño (concordancia, preposición, acento, orden poco natural).
- "incorrect": el significado no corresponde, falta lo esencial o el error impide entenderlo.
- meaning_ok: ¿se entiende lo que se pedía?
- construction_ok: si "construction" no es null, ¿usó correctamente esa construcción gramatical? Si es null, devuelve null.
- used_target: si "target_lemma" no es null, ¿usó esa palabra (en cualquier forma)?
- corrected: la versión más natural en castellano de lo que el alumno quiso decir (si ya es perfecta, repítela).
- explanation_pl: 1-2 frases en polaco; si es correcta, un breve refuerzo positivo concreto.
Si input_mode es "voice", ignora mayúsculas, puntuación y tildes.`,
  });
}

export function generateStory(
  ctx: AiCtx,
  input: {
    level: number;
    tense: "present" | "past" | "future" | "mixed";
    target_words: { lemma: string; pl: string }[];
    known_lemmas: string[];
    interests: string[];
    avoid_titles: string[];
  },
) {
  return structured({
    ...ctx,
    task: "generate_story",
    schema: generatedStorySchema,
    effort: "medium",
    maxTokens: 6000,
    input,
    instructions: `Tarea: escribe una historia corta y coherente en castellano para practicar vocabulario.
- 5–9 oraciones cortas, con una pequeña trama (inicio, problema o sorpresa, final). Debe ser fácil de imaginar, concreta y con algo de humor o emoción. No frases sueltas.
- Usa TODAS las palabras de "target_words" de forma natural (cualquier forma flexionada) y lista en used_target_lemmas los lemas realmente usados.
- Usa sobre todo palabras de "known_lemmas" y palabras muy frecuentes. Como máximo 4 palabras nuevas fuera de esa lista; todas ellas deben aparecer en "glossary" con is_new=true.
- Nivel ${input.level}/5: oraciones de 6–14 palabras. Tiempo verbal predominante: ${input.tense}.
- La historia debe ocurrir en España (lugares, costumbres) y, si encaja, conectar con los intereses del alumno.
- sentences: cada oración con su traducción polaca natural (no literal).
- glossary: 3–10 formas que pueden ser difíciles (form exactamente como aparece, lemma, traducción polaca en contexto).
- questions: 3 preguntas de comprensión en español (con traducción), respuesta modelo breve y 1–3 keywords en minúsculas sin tildes que deben aparecer en una respuesta correcta.
- No repitas títulos de "avoid_titles".`,
  });
}

export function transformStory(
  ctx: AiCtx,
  input: {
    variant: "past" | "extended" | "perspective" | "future";
    story: { title: string; sentences: { es: string; pl: string }[] };
    level: number;
  },
) {
  const how = {
    past: "Cuenta exactamente la misma historia en pasado: pretérito indefinido para los hechos e imperfecto para las descripciones y el contexto.",
    extended: "Mantén la historia y añade 2–3 acontecimientos nuevos al final, usando vocabulario sencillo.",
    perspective: "Cuenta la historia desde la perspectiva de otro personaje (en primera persona de ese personaje).",
    future: "Cuenta la historia como un plan para el futuro, usando sobre todo 'ir a + infinitivo'.",
  }[input.variant];
  return structured({
    ...ctx,
    task: "transform_story",
    schema: generatedStorySchema,
    effort: "medium",
    maxTokens: 6000,
    input,
    instructions: `Tarea: reescribe una historia ya conocida para practicar gramática con el mismo vocabulario. ${how}
Mantén el vocabulario original siempre que sea posible. Devuelve título, oraciones con traducción polaca, glosario (is_new=false para palabras ya vistas en la historia original), 3 preguntas nuevas con keywords, y en used_target_lemmas los lemas principales reutilizados.`,
  });
}

export function evaluateRetell(
  ctx: AiCtx,
  input: {
    mode: "retell" | "own_story";
    story_es: string;
    target_lemmas: string[];
    learner_text: string;
    input_mode: "voice" | "text";
  },
) {
  return structured({
    ...ctx,
    task: "evaluate_retell",
    schema: retellEvaluationSchema,
    effort: "medium",
    maxTokens: 4000,
    input,
    instructions: `Tarea: evalúa ${input.mode === "retell" ? "cómo el alumno vuelve a contar la historia con sus propias palabras (sin ver el texto)" : "la historia propia que el alumno ha creado inspirándose en la historia original"}.
- Valora sobre todo la comunicación: ¿se entiende la historia? No penalices sinónimos ni simplificaciones.
- total_events: número de acontecimientos clave de la historia original; covered_events: cuántos contó (para own_story, cuenta si su historia tiene inicio, desarrollo y final: total 3).
- used_target_lemmas / missing_target_lemmas: de "target_lemmas", cuáles usó y cuáles no (cualquier forma).
- mistakes: solo errores reales, máximo 6, los más importantes primero; grammar_topic_id con uno de: g01-basics, g02-present, g03-ser-estar, g04-tener-haber-gustar, g05-ir-a, g06-perfecto, g07-indefinido, g08-imperfecto, g09-pasados, g10-imperativo-pronombres, g11-subjuntivo, o null.
- score: 0–1, combinando comunicación (60%), vocabulario objetivo (25%) y corrección (15%).
- summary_pl y strengths_pl en polaco, concretos y motivadores, sin exagerar.
${input.input_mode === "voice" ? "El texto viene de reconocimiento de voz: ignora puntuación, mayúsculas y tildes." : ""}`,
  });
}

export function analyzeConversation(
  ctx: AiCtx,
  input: {
    mode: string;
    scenario: { title: string; goals_pl: string[] } | null;
    grammar_focus: string | null;
    learner_level: string;
    target_lemmas: string[];
    transcript: { idx: number; role: "user" | "agent" | "action"; text: string; assisted: boolean }[];
    assessment: boolean;
  },
) {
  return structured({
    ...ctx,
    task: "analyze_conversation",
    schema: conversationAnalysisSchema,
    effort: "high",
    maxTokens: 12000,
    input,
    instructions: `Tarea: analiza una conversación de práctica entre el alumno (role "user") y el tutor/personaje (role "agent"). Las líneas "action" son botones que pulsó el alumno (pista, repetir, no entiendo, traducción).
- summary_pl: 2–3 frases en polaco sobre cómo fue la comunicación.
- mistakes: los errores más importantes del alumno (máx. 8), con la frase original, la versión correcta natural y una explicación breve en polaco. No incluyas variantes estilísticas aceptables. severity "major" solo si dificulta la comprensión o es un error básico repetido.
- missing_words: palabras que el alumno necesitó y no supo decir (preguntó "¿cómo se dice…?", usó polaco/inglés, dio rodeos). lemma = forma de diccionario en español.
- spontaneous_lemmas: lemas que el alumno usó por iniciativa propia y correctamente. NO incluyas palabras que solo repitió justo después de que el tutor las dijera, ni las de turnos con assisted=true.
- grammar_used: construcciones de la lista (g01-basics … g11-subjuntivo) que el alumno intentó usar, indicando si fue correcto, con un ejemplo literal.
- comprehension_issues: momentos en que el alumno no entendió al tutor.
- next_exercise: la práctica más útil para la próxima vez.
- scores (1–5, enteros): comprehension, fluency (independencia y fluidez de las respuestas, penaliza ayudas), grammar, vocabulary (variedad del vocabulario activo), task_completion (¿cumplió los objetivos del escenario?). ${input.assessment ? "Es una evaluación semanal: aplica los criterios de forma estricta y consistente." : ""}
- learner_notes: datos útiles para personalizar futuras clases (intereses, familia, trabajo, errores recurrentes, puntos fuertes). key corta en snake_case y estable.
- task_completed: ¿consiguió el objetivo comunicativo?
Recuerda: la transcripción viene de reconocimiento de voz; no evalúes la pronunciación ni las tildes.`,
  });
}

export function makeMnemonic(ctx: AiCtx, input: { lemma: string; pl: string; example_es: string }) {
  return structured({
    ...ctx,
    task: "mnemonic",
    schema: mnemonicSchema,
    effort: "low",
    maxTokens: 1500,
    input,
    instructions: `Tarea: técnica del palacio de la memoria para un hablante de polaco. Inventa una escena visual, absurda y fácil de imaginar (2–3 frases en polaco) que una el sonido de la palabra española con su significado. sound_link_pl: qué palabra o sonido polaco se parece a la palabra española y cómo se conecta. Nada ofensivo.`,
  });
}

export function planSprint(
  ctx: AiCtx,
  input: {
    goal_text: string;
    scenarios: { id: string; title: string; keywords_pl: string[] }[];
    phrases: { id: string; es: string; pl: string }[];
  },
) {
  return structured({
    ...ctx,
    task: "plan_sprint",
    schema: sprintPlanSchema,
    effort: "low",
    maxTokens: 3000,
    input,
    instructions: `Tarea: el alumno describe un objetivo a corto plazo. Elige los escenarios (ids de la lista) y las frases (ids) más útiles, estima en "days" la duración del sprint (1–21) y lista hasta 15 lemas españoles clave para esas situaciones. summary_pl: 1–2 frases en polaco sobre el plan. Usa solo ids existentes.`,
  });
}

export function tutorReply(
  ctx: AiCtx,
  input: {
    persona_prompt: string;
    history: { role: "user" | "agent"; text: string }[];
    instruction: string | null;
  },
) {
  return structured({
    ...ctx,
    task: "tutor_reply",
    schema: tutorReplySchema,
    effort: "low",
    maxTokens: 1500,
    input,
    instructions: `Tarea: eres el personaje de una conversación de práctica escrita (modo texto). Sigue estas instrucciones del personaje y del tutor:
${input.persona_prompt}
Responde con UN turno breve (1–3 frases) en castellano y su traducción polaca. Si "instruction" no es null, cúmplela en este turno. end_conversation=true solo si la conversación ha llegado a un cierre natural.`,
  });
}

export function translateToPolish(ctx: AiCtx, input: { es: string }) {
  return structured({
    ...ctx,
    task: "translate",
    schema: translationSchema,
    effort: "low",
    maxTokens: 800,
    input,
    instructions: "Tarea: traduce al polaco natural (no literal) esta frase dicha en una conversación. Devuelve solo la traducción en pl.",
  });
}
