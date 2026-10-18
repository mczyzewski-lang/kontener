import type { Db } from "@/lib/db/db";
import { eq, gte } from "@/lib/db/db";
import type { ApiUsageLogRow, LearningPreferencesRow } from "@/lib/db/types";
import { HttpError } from "@/lib/http-error";

/**
 * API cost control. Costs are ESTIMATES based on list prices (configurable via
 * env for ElevenLabs, whose price depends on your plan). They exist to enforce
 * the daily/monthly caps set in Settings — check your provider dashboards for
 * exact billing.
 */

const ANTHROPIC_PRICES: Record<string, { input: number; output: number }> = {
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "claude-fable-5-1": { input: 10, output: 50 },
};

function num(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

export const elevenPrices = {
  ttsPer1kChars: () => num("ELEVENLABS_COST_PER_1K_CHARS", 0.18),
  agentPerMinute: () => num("ELEVENLABS_COST_PER_AGENT_MINUTE", 0.1),
  sttPerHour: () => num("ELEVENLABS_COST_PER_STT_HOUR", 0.4),
};

export function anthropicCost(model: string, inputTokens: number, outputTokens: number): number {
  const p = ANTHROPIC_PRICES[model] ?? ANTHROPIC_PRICES["claude-opus-5-5"];
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}

export async function logUsage(
  db: Db,
  userId: string | null,
  entry: Pick<ApiUsageLogRow, "provider" | "operation" | "units" | "unit_type" | "est_cost_usd"> & { meta?: unknown },
) {
  await db.insert("api_usage_logs", { user_id: userId, meta: {}, ...entry });
}

export interface UsageSummary {
  todayUsd: number;
  monthUsd: number;
  conversationMinutesToday: number;
  byProvider: Record<string, number>;
  generatedToday: number;
}

export async function usageSummary(db: Db, userId: string, now = new Date()): Promise<UsageSummary> {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const dayStart = new Date(now.getTime() - 24 * 3_600_000).toISOString();
  const rows = await db.select("api_usage_logs", { where: [eq("user_id", userId), gte("created_at", monthStart)] });
  const s: UsageSummary = { todayUsd: 0, monthUsd: 0, conversationMinutesToday: 0, byProvider: {}, generatedToday: 0 };
  for (const r of rows) {
    s.monthUsd += r.est_cost_usd;
    s.byProvider[r.provider] = (s.byProvider[r.provider] ?? 0) + r.est_cost_usd;
    if (r.created_at >= dayStart) {
      s.todayUsd += r.est_cost_usd;
      if (r.operation === "conversation") s.conversationMinutesToday += r.units;
      if (r.provider === "anthropic") s.generatedToday++;
    }
  }
  return s;
}

/** Throws 429 when a configured cap would be exceeded. */
export async function assertBudget(
  db: Db,
  userId: string,
  prefs: Pick<LearningPreferencesRow, "daily_cost_limit_usd" | "monthly_cost_limit_usd" | "daily_conversation_minutes_limit"> | null,
  kind: "generation" | "conversation" | "tts" | "stt",
) {
  if (!prefs) return;
  const s = await usageSummary(db, userId);
  if (s.todayUsd >= prefs.daily_cost_limit_usd)
    throw new HttpError(429, `Osiągnięto dzienny limit kosztów API (${prefs.daily_cost_limit_usd} USD). Zmień go w Ustawieniach.`);
  if (s.monthUsd >= prefs.monthly_cost_limit_usd)
    throw new HttpError(429, `Osiągnięto miesięczny limit kosztów API (${prefs.monthly_cost_limit_usd} USD).`);
  if (kind === "conversation" && s.conversationMinutesToday >= prefs.daily_conversation_minutes_limit)
    throw new HttpError(429, `Wykorzystano dzienny limit ${prefs.daily_conversation_minutes_limit} minut rozmów.`);
}
