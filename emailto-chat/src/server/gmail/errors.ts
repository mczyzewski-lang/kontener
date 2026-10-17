/** Errors raised by the Gmail integration layer (provider-agnostic kinds). */
export type GmailErrorKind =
  | "not_found"
  | "needs_reauth"
  | "rate_limited"
  | "invalid"
  | "forbidden"
  | "server"
  | "network"
  | "too_large";

export class GmailError extends Error {
  constructor(
    public readonly kind: GmailErrorKind,
    message: string,
    public readonly status?: number,
    public readonly reason?: string,
  ) {
    super(message);
    this.name = "GmailError";
  }

  /** Gmail answered with an HTTP response (the request definitely reached Gmail and was rejected). */
  get hadResponse(): boolean {
    return this.status !== undefined;
  }
}

export function isGmailError(e: unknown, kind?: GmailErrorKind): e is GmailError {
  return e instanceof GmailError && (!kind || e.kind === kind);
}
