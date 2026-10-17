/** Mail account lifecycle: lookup, connect (store tokens), disconnect, delete user. */
import type { MailAccount } from "@prisma/client";
import { makeSelf, type SelfIdentity } from "@/core/grouping";
import { normalizeEmail } from "@/core/addresses";
import { db } from "../db";
import { ApiError } from "../errors";
import { log } from "../log";
import { decryptOptional, encrypt } from "../security/crypto";
import { getGmailForAccount } from "../gmail/factory";
import type { GmailApi } from "../gmail/types";
import { revokeGoogleToken } from "./google-oauth";

export async function getMailAccount(userId: string): Promise<MailAccount | null> {
  return db.mailAccount.findUnique({ where: { userId_provider: { userId, provider: "gmail" } } });
}

/** The user's Gmail account (any status). Throws needs_reauth when Gmail is not connected. */
export async function requireMailAccount(userId: string): Promise<MailAccount> {
  const account = await getMailAccount(userId);
  if (!account) throw new ApiError("needs_reauth", "Gmail is not connected");
  return account;
}

export function selfIdentity(account: Pick<MailAccount, "emailAddress" | "aliases">): SelfIdentity {
  return makeSelf(account.emailAddress, account.aliases);
}

export function myAddresses(account: Pick<MailAccount, "emailAddress" | "aliases">): string[] {
  return [normalizeEmail(account.emailAddress), ...account.aliases.map(normalizeEmail)].filter(
    (v, i, a) => a.indexOf(v) === i,
  );
}

export interface ConnectInput {
  userId: string;
  googleSub: string;
  emailAddress: string;
  accessToken: string | null;
  refreshToken: string | null;
  expiryDate: number | null;
  scopes: string[];
}

/** Store (encrypted) tokens. Returns the account and whether it is newly connected. */
export async function upsertConnectedAccount(input: ConnectInput): Promise<{ account: MailAccount; isNew: boolean }> {
  const existing = await getMailAccount(input.userId);
  const refreshToken = input.refreshToken ?? decryptOptional(existing?.refreshToken);
  if (!refreshToken) throw new ApiError("needs_reauth", "Google did not return a refresh token");
  const data = {
    emailAddress: normalizeEmail(input.emailAddress),
    googleSub: input.googleSub,
    accessToken: input.accessToken ? encrypt(input.accessToken) : null,
    refreshToken: encrypt(refreshToken),
    accessTokenExpiresAt: input.expiryDate ? new Date(input.expiryDate) : null,
    scopes: input.scopes.join(" "),
    status: "active",
  };
  const account = await db.mailAccount.upsert({
    where: { userId_provider: { userId: input.userId, provider: "gmail" } },
    create: { userId: input.userId, provider: "gmail", ...data },
    update: data,
  });
  await db.syncState.upsert({ where: { accountId: account.id }, create: { accountId: account.id }, update: {} });
  return { account, isNew: !existing };
}

export interface DisconnectDeps {
  gmail?: GmailApi | null;
  revoke?: (token: string) => Promise<void>;
}

/**
 * Disconnect Gmail: users.stop + token revocation at Google (best effort), then delete the
 * MailAccount row, which cascades to ALL synced mail data (threads, messages, contacts,
 * participants, attachment metadata, drafts mapping, sync state, outbound ledger).
 * Tokens are gone from the DB when this returns, so nothing can use them any more.
 */
export async function disconnectAccount(accountId: string, deps: DisconnectDeps = {}): Promise<void> {
  const account = await db.mailAccount.findUnique({ where: { id: accountId } });
  if (!account) return;

  if (account.pushExpiration) {
    try {
      const gmail = deps.gmail !== undefined ? deps.gmail : account.status === "active" ? getGmailForAccount(account) : null;
      await gmail?.stop();
    } catch {
      log.warn("disconnect_stop_failed", { accountId });
    }
  }
  try {
    const token = decryptOptional(account.refreshToken) ?? decryptOptional(account.accessToken);
    if (token) await (deps.revoke ?? revokeGoogleToken)(token);
  } catch {
    log.warn("disconnect_revoke_failed", { accountId });
  }
  await db.mailAccount.delete({ where: { id: accountId } }).catch(() => undefined);
  log.info("account_disconnected", { accountId });
}

/** Delete everything we hold about a user. */
export async function deleteUserCompletely(userId: string, deps: DisconnectDeps = {}): Promise<void> {
  const accounts = await db.mailAccount.findMany({ where: { userId }, select: { id: true } });
  for (const a of accounts) await disconnectAccount(a.id, deps);
  await db.user.delete({ where: { id: userId } }).catch(() => undefined);
  log.info("user_deleted", { userId });
}
