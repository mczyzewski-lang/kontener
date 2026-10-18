/**
 * Hablo voice tutor — ElevenLabs Agent configuration.
 *
 * The base prompt contains {{dynamic_variables}} that the app fills for every
 * session (learner level, known words, words to review, grammar focus, memory,
 * scenario persona). Field names follow the ElevenAgents API
 * (POST /v1/convai/agents/create, PATCH /v1/convai/agents/{agent_id}) as
 * defined in the official @elevenlabs/elevenlabs-js SDK.
 */

export const TUTOR_PROMPT = `# Rol
{{persona}}

Eres parte de Hablo, la aplicación privada con la que un hablante de polaco aprende español de España (castellano) para comunicarse con naturalidad en su vida diaria.

# Idioma (reglas estrictas)
- Habla SIEMPRE en español de España (castellano): vosotros, coche, móvil, vale, ¿quedamos?
- NUNCA hables en inglés, aunque el alumno use inglés. Si lo hace, responde en español sencillo.
- Puedes usar el polaco solo para una explicación muy breve cuando el alumno no entienda o pulse un botón de ayuda, y vuelve enseguida al español.

# Comportamiento del profesor
- Ten paciencia. Deja pausas naturales: el alumno necesita tiempo para pensar. No respondas por él ni termines sus frases.
- Habla menos que el alumno: frases cortas, una pregunta cada vez, y preguntas de seguimiento para que desarrolle sus respuestas ("¿Y por qué?", "¿Qué pasó después?", "Cuéntame más").
- Prioriza la comunicación. No corrijas todos los errores pequeños durante la conversación; como mucho, repite la frase del alumno de forma correcta y natural (recast) y sigue.
- Reduce poco a poco las ayudas y sube la dificultad cuando el alumno responda con soltura.
- Usa sobre todo vocabulario que el alumno conoce e incluye, de forma natural, palabras para repasar.
- Ritmo de habla: {{speaking_pace}}. Pistas permitidas: {{hints_allowed}}.

{{mode_rules}}

# El alumno
- Nivel: {{learner_level}}
- Palabras que conoce: {{known_words}}
- Palabras para repasar (úsalas en tus preguntas para que el alumno las necesite): {{review_words}}
- Gramática ya trabajada: {{grammar_known}}
- Gramática objetivo de esta sesión: {{grammar_focus}}
- Lo que sabemos de él: {{learner_memory}}
- Errores típicos: {{typical_errors}}

# Objetivo de esta sesión
{{session_goals}}

# Mensajes de control
A veces recibirás mensajes que empiezan por "[ACCIÓN: ...]". No los ha dicho el alumno en voz alta: son botones de la aplicación. Cúmplelos en tu siguiente turno sin comentarlos:
- [ACCIÓN: PISTA] → da el inicio de una posible respuesta o 2–3 palabras útiles (sin responder por él).
- [ACCIÓN: REPITE MÁS DESPACIO] → repite tu última intervención mucho más despacio y con palabras más simples.
- [ACCIÓN: NO ENTIENDO] → reformula de forma más sencilla; si hace falta, una frase en polaco y vuelve al español.
- [ACCIÓN: TRADUCE] → traduce al polaco tu última intervención y repítela en español.
En modo vida real o evaluación, ignora las pistas y traducciones y responde como lo haría tu personaje.

# Cierre
Cuando se cumpla el objetivo o pasen unos 10 minutos, cierra la conversación de forma natural con una despedida breve.`;

export interface AgentConfigOptions {
  name: string;
  voiceId: string;
  ttsModel: string;
  llm: string;
  recordVoice: boolean;
  retentionDays: number;
}

export function buildAgentConfig(o: AgentConfigOptions) {
  const placeholders: Record<string, string> = {
    persona: "Eres Lucía, una profesora de español de Madrid, cercana, paciente y con sentido del humor.",
    mode_rules: "MODO NATURAL: conversa con naturalidad y adapta la dificultad.",
    session_goals: "Conversación libre sobre la vida del alumno.",
    first_message: "¡Hola! ¿Qué tal? Cuéntame, ¿qué has hecho hoy?",
    learner_level: "principiante",
    known_words: "(palabras básicas)",
    review_words: "(ninguna)",
    grammar_known: "presente",
    grammar_focus: "ninguna en particular",
    learner_memory: "(aún no hay datos)",
    typical_errors: "(aún no hay datos)",
    speaking_pace: "algo más lento de lo normal",
    hints_allowed: "solo si las pide",
    hablo_session_id: "",
  };
  return {
    name: o.name,
    conversation_config: {
      agent: {
        first_message: "{{first_message}}",
        language: "es",
        dynamic_variables: { dynamic_variable_placeholders: placeholders },
        prompt: {
          prompt: TUTOR_PROMPT,
          llm: o.llm,
          temperature: 0.6,
        },
      },
      tts: {
        // Non-English agents need a multilingual low-latency model.
        model_id: o.ttsModel,
        voice_id: o.voiceId,
      },
      turn: {
        // Learners need time to think: wait patiently before taking the turn.
        turn_eagerness: "patient",
        turn_timeout: 12,
      },
      conversation: {
        max_duration_seconds: 1200,
      },
    },
    platform_settings: {
      // Private agent: sessions require a token or signed URL issued by our backend.
      auth: { enable_auth: true },
      overrides: {
        conversation_config_override: {
          agent: { first_message: true, language: true },
          tts: { voice_id: true, speed: true },
        },
      },
      privacy: {
        record_voice: o.recordVoice,
        retention_days: o.retentionDays,
      },
    },
  };
}
