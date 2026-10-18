import { z } from "zod";
import { body, withSession } from "@/lib/api";
import { eq } from "@/lib/db/db";
import { getPrefs } from "@/lib/learning/profile";
import { integrationStatus } from "@/lib/env";
import { usageSummary } from "@/lib/usage";
import { voiceAvailable } from "@/lib/services/conversation";

export const GET = withSession(async (_req, s) => ({
  prefs: await getPrefs(s.db, s.userId),
  status: { ...integrationStatus(), voice: voiceAvailable() },
  usage: await usageSummary(s.db, s.userId),
  email: s.email,
}));

const schema = z
  .object({
    daily_minutes: z.number().int().min(5).max(120),
    plan_variant: z.enum(["quick", "standard", "deep"]),
    new_words_pace: z.enum(["slow", "normal", "fast"]),
    accent: z.string().max(40),
    timezone: z.string().max(64),
    tutor_speed: z.number().min(0.7).max(1.2),
    hints_default: z.boolean(),
    show_subtitles: z.boolean(),
    show_translation: z.boolean(),
    store_audio: z.boolean(),
    audio_retention_days: z.number().int().min(1).max(365),
    transcript_retention_days: z.number().int().min(7).max(3650).nullable(),
    daily_cost_limit_usd: z.number().min(0).max(100),
    monthly_cost_limit_usd: z.number().min(0).max(1000),
    daily_conversation_minutes_limit: z.number().int().min(0).max(300),
    focus_situations: z.array(z.string()).max(10),
    interests: z.array(z.string().max(40)).max(10),
  })
  .partial();

export const PATCH = withSession(async (req, s) => {
  const patch = await body(req, schema);
  if (patch.timezone) Intl.DateTimeFormat("en", { timeZone: patch.timezone });
  await getPrefs(s.db, s.userId);
  const [prefs] = await s.db.update("learning_preferences", [eq("user_id", s.userId)], { ...patch, updated_at: new Date().toISOString() });
  return { prefs };
});
