import { z } from "zod";
import { search } from "@/server/domain/queries";
import { gmailFor } from "@/server/http";
import { apiHandler } from "@/server/security/api";

const query = z.object({ q: z.string().max(500).default("") });

/** Local index (people, groups, subjects) + Gmail full-text search. */
export const GET = apiHandler({ query, rateLimit: "search" }, async ({ account, query }) =>
  search(account, account.status === "active" ? gmailFor(account) : null, query.q),
);
