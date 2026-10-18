import { z } from "zod";
import { body, withSession } from "@/lib/api";
import { startConversation } from "@/lib/services/conversation";

const schema = z.object({
  scenarioId: z.string().nullable(),
  mode: z.enum(["guided", "natural", "real_life", "assessment", "grammar"]),
  grammarTopicId: z.string().nullable(),
  planItemId: z.string().nullable(),
  channel: z.enum(["voice", "text"]),
});

export const POST = withSession(async (req, s) => startConversation(s, await body(req, schema)));
