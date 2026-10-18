/**
 * Learner control buttons during a conversation. They are sent to the agent as
 * bracketed control messages (ElevenLabs sendUserMessage / text mode) that the
 * agent prompt knows how to handle, and are stored as "action" turns so they
 * are never mistaken for the learner's own Spanish.
 */
export const CONTROL_ACTIONS = {
  hint: {
    label: "Podpowiedź",
    message:
      "[ACCIÓN: PISTA] El alumno pide una pista. Dale el comienzo de una posible respuesta o 2–3 palabras útiles y, si hace falta, una frase muy corta en polaco. No respondas por él.",
  },
  repeat_slower: {
    label: "Powtórz wolniej",
    message: "[ACCIÓN: REPITE MÁS DESPACIO] Repite tu última intervención mucho más despacio y con palabras más sencillas.",
  },
  not_understood: {
    label: "Nie rozumiem",
    message:
      "[ACCIÓN: NO ENTIENDO] El alumno no ha entendido. Reformula de forma más simple; si sigue siendo difícil, explícalo en una frase en polaco y vuelve al español.",
  },
  translate: {
    label: "Tłumaczenie",
    message: "[ACCIÓN: TRADUCE] Traduce al polaco tu última intervención y después repítela en español.",
  },
} as const;

export type ControlAction = keyof typeof CONTROL_ACTIONS;

const ACTION_BY_TAG: Record<string, ControlAction> = {
  PISTA: "hint",
  "REPITE MÁS DESPACIO": "repeat_slower",
  "NO ENTIENDO": "not_understood",
  TRADUCE: "translate",
};

/** Detects a control message in a transcript line (case/accent tolerant). */
export function parseControlMessage(text: string): ControlAction | null {
  const m = /^\s*\[\s*ACCI[OÓ]N\s*:\s*([^\]]+)\]/i.exec(text);
  if (!m) return null;
  const tag = m[1].trim().toUpperCase().replace("MAS", "MÁS");
  return ACTION_BY_TAG[tag] ?? null;
}

/** Which buttons are available in each mode. */
export function actionsForMode(mode: string): ControlAction[] {
  if (mode === "assessment") return ["repeat_slower"];
  if (mode === "real_life") return ["repeat_slower", "not_understood"];
  if (mode === "natural") return ["repeat_slower", "not_understood", "hint", "translate"];
  return ["hint", "repeat_slower", "not_understood", "translate"];
}
