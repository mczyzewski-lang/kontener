import { z } from "zod";
import { body, withSession, type IdCtx } from "@/lib/api";
import {
  answerQuestions,
  createVariant,
  evaluateTelling,
  finishStory,
  getStoryView,
  lookupWord,
  setStage,
} from "@/lib/services/stories";

export const GET = withSession<IdCtx>(async (_req, s, ctx) => getStoryView(s, (await ctx.params).id));

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("stage"), stage: z.number().int().min(0).max(6) }),
  z.object({ action: z.literal("lookup"), form: z.string().max(60), entryId: z.string().nullable() }),
  z.object({ action: z.literal("questions"), answers: z.array(z.string().max(500)).max(6), inputMode: z.enum(["voice", "text"]) }),
  z.object({ action: z.literal("retell"), text: z.string().min(1).max(4000), inputMode: z.enum(["voice", "text"]) }),
  z.object({ action: z.literal("own_story"), text: z.string().min(1).max(4000), inputMode: z.enum(["voice", "text"]) }),
  z.object({ action: z.literal("complete") }),
  z.object({ action: z.literal("variant") }),
]);

export const POST = withSession<IdCtx>(async (req, s, ctx) => {
  const { id } = await ctx.params;
  const input = await body(req, schema);
  switch (input.action) {
    case "stage":
      await setStage(s, id, input.stage);
      return { ok: true };
    case "lookup":
      await lookupWord(s, id, input.form, input.entryId);
      return { ok: true };
    case "questions":
      return answerQuestions(s, id, input.answers, input.inputMode);
    case "retell":
    case "own_story":
      return evaluateTelling(s, id, input.text, input.action, input.inputMode);
    case "complete":
      return finishStory(s, id);
    case "variant":
      return createVariant(s, id);
  }
});
