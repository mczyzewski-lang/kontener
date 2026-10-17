/** Test fixtures: users, connected accounts, sessions, requests. */
import { NextRequest } from "next/server";
import type { MailAccount, User } from "@prisma/client";
import { db } from "@/server/db";
import { setGmailFactory } from "@/server/gmail/factory";
import { encrypt } from "@/server/security/crypto";
import { createSession, SESSION_COOKIE } from "@/server/security/session";
import { FakeGmail } from "./fake-gmail";

export const ME = "me@example.com";

export interface TestAccount {
  user: User;
  account: MailAccount;
  gmail: FakeGmail;
  token: string;
}

let n = 0;

export async function createTestAccount(opts: { email?: string; aliases?: string[]; name?: string } = {}): Promise<TestAccount> {
  n++;
  const email = opts.email ?? ME;
  const user = await db.user.create({
    data: { email, name: opts.name ?? "Me Myself", googleSub: `sub-${n}-${Date.now()}` },
  });
  const account = await db.mailAccount.create({
    data: {
      userId: user.id,
      emailAddress: email,
      googleSub: user.googleSub,
      accessToken: encrypt("fake-access-token"),
      refreshToken: encrypt("fake-refresh-token"),
      accessTokenExpiresAt: new Date(Date.now() + 3600_000),
      scopes: "openid email https://www.googleapis.com/auth/gmail.modify",
      aliases: opts.aliases ?? [],
      syncState: { create: {} },
    },
  });
  const gmail = new FakeGmail(email);
  setGmailFactory((a) => {
    if (a.id !== account.id) throw new Error("FakeGmail: unexpected account");
    return gmail;
  });
  const { token } = await createSession(user.id, "vitest");
  return { user, account, gmail, token };
}

export async function reloadAccount(id: string): Promise<MailAccount> {
  return (await db.mailAccount.findUnique({ where: { id } }))!;
}

export function apiRequest(
  pathAndQuery: string,
  opts: { method?: string; token?: string; body?: unknown; origin?: string | null; headers?: Record<string, string> } = {},
): NextRequest {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (opts.token) headers.cookie = `${SESSION_COOKIE}=${opts.token}`;
  const method = opts.method ?? "GET";
  if (method !== "GET" && opts.origin !== null) headers.origin = opts.origin ?? "http://localhost:3000";
  let body: BodyInit | undefined;
  if (opts.body instanceof FormData) body = opts.body;
  else if (opts.body !== undefined) {
    body = JSON.stringify(opts.body);
    headers["content-type"] = "application/json";
  }
  return new NextRequest(new URL(pathAndQuery, "http://localhost:3000"), { method, headers, body });
}

export function routeCtx<P>(params: P): { params: Promise<P> } {
  return { params: Promise.resolve(params) };
}
