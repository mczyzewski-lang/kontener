import { getAccountInfo } from "@/server/domain/account-info";
import { apiHandler } from "@/server/security/api";

/** AccountInfo — works without a Gmail connection (mailAccount: null → UI shows /app/connect). */
export const GET = apiHandler({ auth: "user" }, async ({ user }) => getAccountInfo(user));
