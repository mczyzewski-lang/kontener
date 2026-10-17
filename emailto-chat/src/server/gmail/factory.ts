/**
 * Builds a `GmailApi` for a MailAccount: decrypts tokens, lets google-auth-library refresh the
 * access token when needed, and persists refreshed tokens (encrypted). Revoked grants flip the
 * account to `needs_reauth`. Tests swap the factory for an in-memory FakeGmail.
 */
import type { MailAccount } from "@prisma/client";
import { db } from "../db";
import { ApiError } from "../errors";
import { log } from "../log";
import { createOAuthClient } from "../auth/google-oauth";
import { decryptOptional, encrypt } from "../security/crypto";
import { GoogleGmailApi } from "./client";
import type { GmailApi } from "./types";

export type GmailFactory = (account: MailAccount) => GmailApi;

let override: GmailFactory | null = null;

/** Tests: route every account to a fake. Pass null to restore the real implementation. */
export function setGmailFactory(f: GmailFactory | null): void {
  override = f;
}

export async function markNeedsReauth(accountId: string): Promise<void> {
  await db.mailAccount.updateMany({ where: { id: accountId }, data: { status: "needs_reauth" } });
  log.warn("gmail_needs_reauth", { accountId });
}

export function getGmailForAccount(account: MailAccount): GmailApi {
  if (account.status !== "active") throw new ApiError("needs_reauth", "Gmail access expired — reconnect Gmail");
  if (override) return override(account);
  const refreshToken = decryptOptional(account.refreshToken);
  const accessToken = decryptOptional(account.accessToken);
  if (!refreshToken && !accessToken) throw new ApiError("needs_reauth", "Gmail is not connected");

  const client = createOAuthClient();
  client.setCredentials({
    refresh_token: refreshToken ?? undefined,
    access_token: accessToken ?? undefined,
    expiry_date: account.accessTokenExpiresAt?.getTime(),
  });
  client.on("tokens", (tokens) => {
    if (!tokens.access_token) return;
    db.mailAccount
      .update({
        where: { id: account.id },
        data: {
          accessToken: encrypt(tokens.access_token),
          accessTokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
          // Google may rotate refresh tokens; keep the newest.
          ...(tokens.refresh_token ? { refreshToken: encrypt(tokens.refresh_token) } : {}),
        },
      })
      .catch(() => log.warn("token_persist_failed", { accountId: account.id }));
  });
  return new GoogleGmailApi(client, { onAuthFailure: () => markNeedsReauth(account.id) });
}
