import { z } from "zod";
import { body, withSession, type IdCtx } from "@/lib/api";
import { getFeedback, linkElevenConversation } from "@/lib/services/conversation";

export const GET = withSession<IdCtx>(async (_req, s, ctx) => getFeedback(s, (await ctx.params).id));

export const PATCH = withSession<IdCtx>(async (req, s, ctx) => {
  const { elevenConversationId } = await body(req, z.object({ elevenConversationId: z.string().min(3).max(120) }));
  await linkElevenConversation(s, (await ctx.params).id, elevenConversationId);
  return { ok: true };
});
