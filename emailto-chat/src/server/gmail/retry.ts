/** Retry with exponential backoff + full jitter, and Google API error classification. */
import { GmailError, type GmailErrorKind } from "./errors";

const RETRY_STATUS = new Set([429, 500, 502, 503, 504]);
const RATE_REASONS = new Set(["rateLimitExceeded", "userRateLimitExceeded", "backendError"]);

interface GoogleLikeError {
  status?: number;
  code?: number | string;
  message?: string;
  response?: { status?: number; data?: unknown };
  errors?: Array<{ reason?: string }>;
}

function reasonOf(e: GoogleLikeError): string | undefined {
  const data = e.response?.data as { error?: unknown } | undefined;
  if (data && typeof data.error === "string") return data.error; // OAuth errors: { error: "invalid_grant" }
  const nested = (data?.error as { errors?: Array<{ reason?: string }>; status?: string } | undefined) ?? undefined;
  return nested?.errors?.[0]?.reason ?? e.errors?.[0]?.reason ?? nested?.status;
}

export function classifyGoogleError(err: unknown): GmailError {
  if (err instanceof GmailError) return err;
  const e = (err ?? {}) as GoogleLikeError;
  const status = e.status ?? e.response?.status ?? (typeof e.code === "number" ? e.code : undefined);
  const reason = reasonOf(e);
  const msg = String(e.message ?? "");
  let kind: GmailErrorKind;
  if (reason === "invalid_grant" || /invalid_grant|No refresh token|invalid_token/i.test(msg) || status === 401) {
    kind = "needs_reauth";
  } else if (status === 404 || status === 410) kind = "not_found";
  else if (status === 429 || (status === 403 && reason && RATE_REASONS.has(reason))) kind = "rate_limited";
  else if (status === 403) kind = reason === "insufficientPermissions" || reason === "ACCESS_TOKEN_SCOPE_INSUFFICIENT" ? "needs_reauth" : "forbidden";
  else if (status === 413) kind = "too_large";
  else if (status === 400) kind = "invalid";
  else if (status && status >= 500) kind = "server";
  else if (!status) kind = "network";
  else kind = "server";
  // Message deliberately excludes response bodies (could contain mail data).
  return new GmailError(kind, `gmail_${kind}${status ? `_${status}` : ""}`, status, reason);
}

export function isRetryable(e: GmailError): boolean {
  if (e.kind === "rate_limited") return true;
  if (e.status && RETRY_STATUS.has(e.status)) return true;
  return e.kind === "network";
}

export interface RetryOptions {
  attempts?: number;
  baseMs?: number;
  maxMs?: number;
  sleep?: (ms: number) => Promise<void>;
  /** Override the retry predicate (e.g. send: only retry rate limits, which are never accepted). */
  retryIf?: (e: GmailError) => boolean;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function withRetry<T>(fn: () => Promise<T>, o: RetryOptions = {}): Promise<T> {
  const attempts = o.attempts ?? 5;
  const base = o.baseMs ?? 250;
  const max = o.maxMs ?? 8000;
  const sleep = o.sleep ?? defaultSleep;
  let last: GmailError | null = null;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      last = classifyGoogleError(err);
      const retry = (o.retryIf ?? isRetryable)(last);
      if (!retry || i === attempts - 1) throw last;
      const cap = Math.min(max, base * 2 ** i);
      await sleep(Math.random() * cap);
    }
  }
  throw last ?? new GmailError("server", "gmail_retry_exhausted");
}
