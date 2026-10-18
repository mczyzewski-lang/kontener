import { z } from "zod";
import { body, withSession, type IdCtx } from "@/lib/api";
import { answerGrammarExercise, answerMiniConversation, completeLesson, grammarLesson } from "@/lib/services/grammar";

export const GET = withSession<IdCtx>(async (_req, s, ctx) => grammarLesson(s, (await ctx.params).id));

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("exercise"), index: z.number().int().min(0), response: z.string().max(1000), inputMode: z.enum(["voice", "text", "choice"]) }),
  z.object({ action: z.literal("mini"), index: z.number().int().min(0), response: z.string().max(1000), inputMode: z.enum(["voice", "text"]) }),
  z.object({ action: z.literal("complete") }),
]);

export const POST = withSession<IdCtx>(async (req, s, ctx) => {
  const { id } = await ctx.params;
  const input = await body(req, schema);
  if (input.action === "exercise") return answerGrammarExercise(s, id, input.index, input.response, input.inputMode);
  if (input.action === "mini") return answerMiniConversation(s, id, input.index, input.response, input.inputMode);
  return completeLesson(s, id);
});
