import { updatePreferences } from "@/server/domain/account-info";
import { preferencesPatchSchema } from "@/server/schemas";
import { apiHandler } from "@/server/security/api";

export const PATCH = apiHandler({ auth: "user", body: preferencesPatchSchema }, async ({ user, body }) =>
  updatePreferences(user.id, body),
);
