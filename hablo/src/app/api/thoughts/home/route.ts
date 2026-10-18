import { withSession } from "@/lib/api";
import { pickThought } from "@/lib/thoughts/service";
import { autoContext, THOUGHT_CONTEXTS } from "@/lib/thoughts/contexts";
import { getPrefs } from "@/lib/learning/profile";
import type { ThoughtContext } from "@/lib/db/types";

/** The single thought for the home screen in the requested (or clock-based) context. */
export const GET = withSession(async (req, s) => {
  const prefs = await getPrefs(s.db, s.userId);
  const q = new URL(req.url).searchParams.get("ctx");
  const ctx: ThoughtContext = THOUGHT_CONTEXTS.some((c) => c.id === q) ? (q as ThoughtContext) : autoContext(prefs.timezone);
  const t = await pickThought(s.db, s.userId, ctx, prefs.timezone);
  return { context: ctx, thought: t ? { id: t.id, text: t.text, favorite: t.favorite } : null };
});
