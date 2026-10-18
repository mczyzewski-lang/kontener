import { z } from "zod";
import { body, withSession } from "@/lib/api";
import { deleteData } from "@/lib/services/data";

export const DELETE = withSession(async (req, s) => {
  const { scope, confirm } = await body(req, z.object({ scope: z.enum(["transcripts", "recordings", "all"]), confirm: z.literal("USUŃ") }));
  void confirm;
  return deleteData(s, scope);
});
