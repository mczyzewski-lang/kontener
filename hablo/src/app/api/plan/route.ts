import { z } from "zod";
import { body, withSession } from "@/lib/api";
import { changeTodayVariant, getOrCreateTodayPlan } from "@/lib/learning/plan-service";
import { HttpError } from "@/lib/http-error";

export const GET = withSession(async (_req, s) => getOrCreateTodayPlan(s.db, s.userId));

export const POST = withSession(async (req, s) => {
  const { variant } = await body(req, z.object({ variant: z.enum(["quick", "standard", "deep"]) }));
  try {
    return await changeTodayVariant(s.db, s.userId, variant);
  } catch (e) {
    throw new HttpError(409, e instanceof Error ? e.message : "Nie można zmienić planu.");
  }
});
