import "server-only";
import type { z } from "zod";
import { HttpError } from "@/lib/http-error";

export { withSession } from "@/lib/session";

/** Parses and validates a JSON request body. */
export async function body<S extends z.ZodType>(req: Request, schema: S): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new HttpError(400, "Nieprawidłowy JSON.");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new HttpError(400, `Nieprawidłowe dane: ${parsed.error.issues.map((i) => i.path.join(".") + " " + i.message).join("; ")}`);
  return parsed.data;
}

export type IdCtx = { params: Promise<{ id: string }> };
