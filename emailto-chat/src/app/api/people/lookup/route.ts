import { z } from "zod";
import { findPerson } from "@/server/domain/queries";
import { apiHandler } from "@/server/security/api";

const query = z.object({ email: z.string().trim().min(3).max(320) });

/** PersonSummary | null. Creates the contact index entry for a valid, unknown address. */
export const GET = apiHandler({ query }, async ({ account, query }) => (await findPerson(account, query.email)) ?? null);
