import { z } from "zod";
import { body, withSession } from "@/lib/api";
import { translateToPolish } from "@/lib/ai/tasks";
import { getPrefs } from "@/lib/learning/profile";
import { HttpError } from "@/lib/http-error";

/** On-demand Polish translation of a tutor's line (subtitles). */
export const POST = withSession(async (req, s) => {
  const { es } = await body(req, z.object({ es: z.string().min(1).max(600) }));
  const r = await translateToPolish({ db: s.db, userId: s.userId, prefs: await getPrefs(s.db, s.userId) }, { es });
  if (!r) throw new HttpError(503, "Tłumaczenie wymaga klucza Claude API.");
  return r;
});
