import { z } from "zod";
import { body, withSession } from "@/lib/api";
import { completeOnboarding } from "@/lib/services/onboarding";

const schema = z.object({
  level: z.enum(["unknown", "beginner", "elementary", "intermediate", "advanced"]),
  dailyMinutes: z.number().min(5).max(120),
  motivation: z.string().max(1000),
  situations: z.array(z.string()).max(10),
  interests: z.array(z.string().max(40)).max(10),
  timezone: z.string().min(1).max(64),
  displayName: z.string().max(40).nullable(),
  placement: z.array(z.object({ entryId: z.string(), answer: z.string() })).max(60).nullable(),
  communication: z
    .array(z.object({ id: z.string(), text: z.string().max(1000), inputMode: z.enum(["voice", "text"]) }))
    .max(5)
    .nullable(),
});

export const POST = withSession(async (req, s) => completeOnboarding(s, await body(req, schema)));
