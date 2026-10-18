import { z } from "zod";
import { body, withSession } from "@/lib/api";
import { addThought, listLibrary } from "@/lib/thoughts/service";

const CONTEXTS = ["morning", "end_of_work", "new_idea", "tension", "family", "rest", "travel"] as const;

export const GET = withSession(async (_req, s) => listLibrary(s.db, s.userId));

export const POST = withSession(async (req, s) => {
  const input = await body(
    req,
    z.object({
      kind: z.enum(["thought", "question"]).default("thought"),
      text: z.string().trim().min(1).max(4000),
      category_key: z.string().max(80).nullable().default(null),
      contexts: z.array(z.enum(CONTEXTS)).max(7).default([]),
    }),
  );
  return { entry: await addThought(s.db, s.userId, input) };
});
