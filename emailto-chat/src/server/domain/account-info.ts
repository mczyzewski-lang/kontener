/** /api/me and preferences. */
import type { User } from "@prisma/client";
import { DEFAULT_PREFERENCES, type AccountInfo, type UserPreferences } from "@/core/types";
import { getMailAccount, myAddresses } from "../auth/account";
import { db } from "../db";

export async function getPreferences(userId: string): Promise<UserPreferences> {
  const p = await db.userPreference.findUnique({ where: { userId } });
  if (!p) return { ...DEFAULT_PREFERENCES };
  return {
    enterToSend: p.enterToSend,
    theme: (["system", "light", "dark"].includes(p.theme) ? p.theme : "system") as UserPreferences["theme"],
    alwaysLoadRemoteImages: p.alwaysLoadRemoteImages,
    pollIntervalSec: p.pollIntervalSec,
  };
}

export async function updatePreferences(userId: string, patch: Partial<UserPreferences>): Promise<UserPreferences> {
  await db.userPreference.upsert({
    where: { userId },
    create: { userId, ...DEFAULT_PREFERENCES, ...patch },
    update: patch,
  });
  return getPreferences(userId);
}

export async function getAccountInfo(user: User): Promise<AccountInfo> {
  const [account, preferences] = await Promise.all([getMailAccount(user.id), getPreferences(user.id)]);
  return {
    mode: "live",
    user: { id: user.id, name: user.name, email: user.email, image: user.image },
    mailAccount: account
      ? {
          email: account.emailAddress,
          status: account.status === "needs_reauth" ? "needs_reauth" : "active",
          aliases: myAddresses(account),
          pushEnabled: !!account.pushExpiration && account.pushExpiration.getTime() > Date.now(),
        }
      : null,
    preferences,
  };
}
