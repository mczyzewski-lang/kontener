import { z } from "zod";
import { body, withSession, type IdCtx } from "@/lib/api";
import { finishConversation } from "@/lib/services/conversation";

const schema = z.object({
  elevenConversationId: z.string().max(120).nullable(),
  localTranscript: z.array(z.object({ role: z.enum(["user", "agent"]), text: z.string().max(4000), time: z.number().nullable().optional() })).max(400),
  durationSecs: z.number().min(0).max(4 * 3600),
  counters: z.record(z.string(), z.number().int().min(0)).default({}),
});

export const POST = withSession<IdCtx>(async (req, s, ctx) => finishConversation(s, (await ctx.params).id, await body(req, schema)));
