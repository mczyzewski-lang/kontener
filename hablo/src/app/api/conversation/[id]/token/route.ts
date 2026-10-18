import { withSession, type IdCtx } from "@/lib/api";
import { eq } from "@/lib/db/db";
import { getConversationToken } from "@/lib/elevenlabs/server";
import { assertBudget } from "@/lib/usage";
import { getPrefs } from "@/lib/learning/profile";
import { HttpError } from "@/lib/http-error";

/** Fresh conversation token to reconnect an interrupted voice session (same Hablo session). */
export const POST = withSession<IdCtx>(async (_req, s, ctx) => {
  const { id } = await ctx.params;
  const row = (await s.db.select("conversation_sessions", { where: [eq("id", id), eq("user_id", s.userId)], limit: 1 }))[0];
  if (!row || row.status !== "active" || row.channel !== "voice") throw new HttpError(409, "Tej rozmowy nie można wznowić.");
  await assertBudget(s.db, s.userId, await getPrefs(s.db, s.userId), "conversation");
  return { conversationToken: await getConversationToken(s.userId.slice(0, 8)) };
});
