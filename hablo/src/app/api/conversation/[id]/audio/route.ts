import { withSession, type IdCtx } from "@/lib/api";
import { eq } from "@/lib/db/db";
import { getObject } from "@/lib/storage";
import { HttpError } from "@/lib/http-error";

/** Plays back a stored recording (only when the learner enabled recording retention). */
export const GET = withSession<IdCtx>(async (_req, s, ctx) => {
  const { id } = await ctx.params;
  const row = (await s.db.select("conversation_sessions", { where: [eq("id", id), eq("user_id", s.userId)], limit: 1 }))[0];
  if (!row?.audio_path) throw new HttpError(404, "Brak nagrania dla tej rozmowy.");
  const audio = await getObject("recordings", row.audio_path);
  if (!audio) throw new HttpError(404, "Nagranie wygasło lub zostało usunięte.");
  return new Response(audio, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, no-store" } });
});
