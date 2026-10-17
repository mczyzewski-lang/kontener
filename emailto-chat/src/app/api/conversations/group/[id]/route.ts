import { getConversation } from "@/server/domain/queries";
import { dbIdSchema } from "@/server/schemas";
import { apiHandler } from "@/server/security/api";

export const GET = apiHandler<undefined, undefined, { id: string }>({}, async ({ account, params }) =>
  getConversation(account, { kind: "group", id: dbIdSchema.parse(params.id) }),
);
