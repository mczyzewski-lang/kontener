import { z } from "zod";
import { listConversations } from "@/server/domain/queries";
import { mailboxSchema, readFilterSchema } from "@/server/schemas";
import { apiHandler } from "@/server/security/api";

const query = z.object({ mailbox: mailboxSchema.default("inbox"), filter: readFilterSchema.default("all") });

/** Sidebar (served from the local index — also works while Gmail needs re-auth). */
export const GET = apiHandler({ query }, async ({ account, query }) => listConversations(account, query));
