import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { env } from "@/lib/env";
import type { Db } from "@/lib/db/db";
import { anthropicCost, assertBudget, logUsage } from "@/lib/usage";
import type { LearningPreferencesRow } from "@/lib/db/types";
import { mockResponse } from "./mock";

export type AiTask =
  | "evaluate_answer"
  | "generate_story"
  | "transform_story"
  | "evaluate_retell"
  | "analyze_conversation"
  | "mnemonic"
  | "plan_sprint"
  | "tutor_reply"
  | "translate";

export type AiProvider = "anthropic" | "mock" | null;

export function aiProvider(): AiProvider {
  if (env.aiMock()) return "mock";
  if (env.anthropicKey()) return "anthropic";
  return null;
}

export class AiUnavailableError extends Error {
  constructor(message = "AI provider not configured") {
    super(message);
  }
}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: env.anthropicKey(), maxRetries: 2, timeout: 90_000 });
  return client;
}

/** Stable instructions shared by every task (kept first so they can be cached). */
export const TEACHER_SYSTEM = `Eres el motor pedagógico de Hablo, una aplicación privada para que un hablante de polaco aprenda español de España (castellano) para comunicarse con naturalidad.
Principios:
- Usa español peninsular natural y actual: vosotros, coche, móvil, ordenador, vale, ¿quedamos?, coger. Si una forma es típica solo de Latinoamérica, menciónalo.
- Todas las explicaciones para el alumno van en polaco claro y breve. Nunca uses inglés.
- Prioriza la comunicación: distingue errores reales (que cambian el significado o suenan mal a un nativo) de variantes estilísticas aceptables. No marques como error una alternativa correcta.
- Los acentos gráficos que faltan en una respuesta oral transcrita no son errores.
- Nunca inventes palabras ni construcciones; si dudas, elige la opción más frecuente y natural.
- La pronunciación no se puede evaluar a partir de una transcripción; como mucho, señala palabras que el reconocimiento de voz transcribió de forma rara como "pronunciation_suspect".`;

export interface StructuredCall<S extends z.ZodType> {
  task: AiTask;
  schema: S;
  instructions: string;
  input: unknown;
  db: Db;
  userId: string;
  prefs: LearningPreferencesRow | null;
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
}

/**
 * Calls Claude with structured output and validates the result. Returns null
 * when no AI provider is configured so callers can fall back to deterministic
 * logic (and tell the user the result is approximate).
 */
export async function structured<S extends z.ZodType>(call: StructuredCall<S>): Promise<z.infer<S> | null> {
  const provider = aiProvider();
  if (!provider) return null;
  if (provider === "mock") {
    return call.schema.parse(mockResponse(call.task, call.input)) as z.infer<S>;
  }
  await assertBudget(call.db, call.userId, call.prefs, "generation");
  const model = env.anthropicModel();
  const res = await getClient().beta.messages.parse({
    model,
    max_tokens: call.maxTokens ?? 16000,
    // Server-side refusal fallback: a declined request is retried on a fallback model.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: call.effort ?? "medium", format: betaZodOutputFormat(call.schema) },
    system: [{ type: "text", text: `${TEACHER_SYSTEM}\n\n${call.instructions}` }],
    messages: [{ role: "user", content: JSON.stringify(call.input) }],
  });
  await logUsage(call.db, call.userId, {
    provider: "anthropic",
    operation: call.task,
    units: res.usage.input_tokens + res.usage.output_tokens,
    unit_type: "tokens",
    est_cost_usd: anthropicCost(model, res.usage.input_tokens, res.usage.output_tokens),
    meta: { model: res.model, input_tokens: res.usage.input_tokens, output_tokens: res.usage.output_tokens },
  });
  if (res.stop_reason === "refusal") throw new Error("Model odmówił wykonania zadania.");
  if (res.stop_reason === "max_tokens") throw new Error("Odpowiedź modelu została ucięta (max_tokens).");
  if (!res.parsed_output) throw new Error("Model nie zwrócił poprawnego JSON.");
  return call.schema.parse(res.parsed_output) as z.infer<S>;
}
