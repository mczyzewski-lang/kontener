import { z } from "zod";
import { body, withSession, type IdCtx } from "@/lib/api";
import { updatePlanItem } from "@/lib/learning/plan-service";
import { HttpError } from "@/lib/http-error";
import { logEvent } from "@/lib/learning/profile";

const schema = z.object({ status: z.enum(["pending", "in_progress", "done", "skipped"]), result: z.unknown().optional() });

export const PATCH = withSession<IdCtx>(async (req, s, ctx) => {
  const { id } = await ctx.params;
  const input = await body(req, schema);
  const item = await updatePlanItem(s.db, s.userId, id, input);
  if (!item) throw new HttpError(404, "Nie ma takiego zadania.");
  if (input.status === "done" && item.type === "feedback") await logEvent(s.db, s.userId, "feedback", { minutes: 1 });
  return { item };
});
