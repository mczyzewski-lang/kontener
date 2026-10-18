import { z } from "zod";
import { body, withSession } from "@/lib/api";
import { submitAnswer } from "@/lib/services/review";

const schema = z.object({
  entryId: z.string(),
  skill: z.enum(["listening", "recall", "speaking"]),
  type: z.enum(["listen_choose", "listen_sentence", "recall_say", "fill_blank", "translate", "distinguish", "speak_prompt", "own_sentence"]),
  exampleIdx: z.number().int().min(0).nullable(),
  response: z.string().max(1000),
  inputMode: z.enum(["voice", "text", "choice"]),
  latencyMs: z.number().int().min(0).max(600000).nullable(),
  assisted: z.boolean(),
  source: z.enum(["flashcard", "new_words", "manual"]),
});

export const POST = withSession(async (req, s) => submitAnswer(s, await body(req, schema)));
