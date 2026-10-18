import { z } from "zod";
import { body, withSession, type IdCtx } from "@/lib/api";
import { textTurn } from "@/lib/services/conversation";

const schema = z.object({
  message: z.string().max(1000).optional(),
  action: z.enum(["hint", "repeat_slower", "not_understood", "translate"]).optional(),
});

export const POST = withSession<IdCtx>(async (req, s, ctx) => textTurn(s, (await ctx.params).id, await body(req, schema)));
