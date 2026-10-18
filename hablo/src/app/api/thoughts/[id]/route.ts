import { z } from "zod";
import { body, withSession, type IdCtx } from "@/lib/api";
import { updateThought } from "@/lib/thoughts/service";
import { HttpError } from "@/lib/http-error";

const CONTEXTS = ["morning", "end_of_work", "new_idea", "tension", "family", "rest", "travel"] as const;
const schema = z
  .object({
    text: z.string().trim().min(1).max(4000),
    category_key: z.string().max(80).nullable(),
    contexts: z.array(z.enum(CONTEXTS)).max(7),
    favorite: z.boolean(),
    hidden: z.boolean(),
    featured: z.boolean(),
  })
  .partial();

export const PATCH = withSession<IdCtx>(async (req, s, ctx) => {
  const row = await updateThought(s.db, s.userId, (await ctx.params).id, await body(req, schema));
  if (!row) throw new HttpError(404, "Nie ma takiego wpisu.");
  return { entry: row };
});
