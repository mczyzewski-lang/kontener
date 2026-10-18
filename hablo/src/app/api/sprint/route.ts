import { z } from "zod";
import { body, withSession } from "@/lib/api";
import { cancelSprint, createSprint } from "@/lib/services/sprint";

export const POST = withSession(async (req, s) => createSprint(s, (await body(req, z.object({ goal: z.string().max(500) }))).goal));
export const DELETE = withSession(async (_req, s) => {
  await cancelSprint(s);
  return { ok: true };
});
