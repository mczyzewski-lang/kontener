/**
 * `apiHandler` — the one wrapper every API route uses:
 * session auth → (optional) mail account → CSRF origin check → rate limit → zod validation →
 * handler → consistent JSON errors `{ error: { code, message } }`.
 *
 * Logging: only route, status, error code and ids. Never tokens or message content.
 */
import type { MailAccount, User } from "@prisma/client";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireMailAccount } from "../auth/account";
import { EnvError } from "../env";
import { ApiError, type ApiErrorCode } from "../errors";
import { GmailError } from "../gmail/errors";
import { errorCode, log } from "../log";
import { assertSameOrigin } from "./csrf";
import { clientIp, takeToken, type BucketName } from "./rate-limit";
import { getSessionFromRequest, sessionCookieHeader, type SessionContext } from "./session";

export type AuthMode = "none" | "user" | "account";

export interface HandlerContext<TQuery, TBody, TParams> {
  req: NextRequest;
  params: TParams;
  query: TQuery;
  body: TBody;
  /** Throws when auth = "none". */
  readonly user: User;
  /** Throws unless auth = "account". */
  readonly account: MailAccount;
  readonly session: SessionContext | null;
}

export interface ApiOptions<TQuery, TBody> {
  /** Default "account": signed in AND an active Gmail connection. */
  auth?: AuthMode;
  /** Origin check for mutating methods. Default true. */
  csrf?: boolean;
  /** Bucket name or false to disable. Default "default". */
  rateLimit?: BucketName | false;
  query?: z.ZodType<TQuery>;
  body?: z.ZodType<TBody>;
}

type RouteCtx<TParams> = { params: Promise<TParams> };

export function jsonError(code: ApiErrorCode, message: string, status: number, headers?: Record<string, string>): Response {
  return Response.json({ error: { code, message } }, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

export function gmailErrorToApi(e: GmailError): ApiError {
  switch (e.kind) {
    case "not_found":
      return new ApiError("not_found", "Not found in Gmail");
    case "needs_reauth":
      return new ApiError("needs_reauth", "Gmail access expired or was revoked — reconnect Gmail");
    case "rate_limited":
      return new ApiError("rate_limited", "Gmail rate limit — try again shortly");
    case "invalid":
      return new ApiError("invalid", "Gmail rejected the request");
    case "too_large":
      return new ApiError("too_large", "Message too large for Gmail");
    case "forbidden":
      return new ApiError("needs_reauth", "Gmail permission missing — reconnect Gmail");
    default:
      return new ApiError("server", "Gmail is unavailable — try again", 502);
  }
}

export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  if (err instanceof GmailError) return gmailErrorToApi(err);
  if (err instanceof z.ZodError) {
    const first = err.issues[0];
    return new ApiError("invalid", first ? `${first.path.join(".") || "input"}: ${first.message}` : "Invalid input");
  }
  if (err instanceof EnvError) return new ApiError("server", "Server is misconfigured");
  return new ApiError("server", "Internal error");
}

export function apiHandler<TQuery = undefined, TBody = undefined, TParams = Record<string, string>>(
  opts: ApiOptions<TQuery, TBody>,
  handler: (ctx: HandlerContext<TQuery, TBody, TParams>) => Promise<unknown>,
) {
  const authMode = opts.auth ?? "account";
  return async (req: NextRequest, routeCtx?: RouteCtx<TParams>): Promise<Response> => {
    const started = Date.now();
    let session: SessionContext | null = null;
    try {
      if (opts.csrf !== false) assertSameOrigin(req);

      if (authMode !== "none") {
        session = await getSessionFromRequest(req);
        if (!session) throw new ApiError("unauthorized", "Not signed in");
      }

      if (opts.rateLimit !== false) {
        const wait = await takeToken(opts.rateLimit ?? "default", session?.user.id ?? `ip:${clientIp(req)}`);
        if (wait > 0) {
          throw new ApiError("rate_limited", "Too many requests", 429, { "Retry-After": String(Math.ceil(wait / 1000)) });
        }
      }

      const account = authMode === "account" ? await requireMailAccount(session!.user.id) : null;

      const params = (routeCtx ? await routeCtx.params : {}) as TParams;
      const query = (opts.query
        ? opts.query.parse(Object.fromEntries(req.nextUrl.searchParams.entries()))
        : undefined) as TQuery;

      let body = undefined as TBody;
      if (opts.body) {
        let raw: unknown;
        try {
          raw = await req.json();
        } catch {
          throw new ApiError("invalid", "Body must be JSON");
        }
        body = opts.body.parse(raw);
      }

      const s = session;
      const ctx: HandlerContext<TQuery, TBody, TParams> = {
        req,
        params,
        query,
        body,
        session: s,
        get user() {
          if (!s) throw new ApiError("unauthorized", "Not signed in");
          return s.user;
        },
        get account() {
          if (!account) throw new ApiError("needs_reauth", "Gmail is not connected");
          return account;
        },
      };

      const result = await handler(ctx);
      const res =
        result instanceof Response
          ? result
          : Response.json(result === undefined ? { ok: true } : result, { headers: { "Cache-Control": "no-store" } });
      if (session?.refreshed && !res.headers.has("set-cookie")) {
        try {
          res.headers.append("Set-Cookie", sessionCookieHeader(session.token));
        } catch {
          // immutable headers (e.g. redirect) — skip
        }
      }
      return res;
    } catch (err) {
      const apiErr = toApiError(err);
      const fields = {
        route: req.nextUrl?.pathname,
        method: req.method,
        status: apiErr.status,
        code: apiErr.code,
        cause: errorCode(err),
        userId: session?.user.id,
        ms: Date.now() - started,
      };
      if (apiErr.status >= 500) log.error("api_error", fields);
      else if (apiErr.status !== 401) log.warn("api_rejected", fields);
      return jsonError(apiErr.code, apiErr.message, apiErr.status, apiErr.headers);
    }
  };
}
