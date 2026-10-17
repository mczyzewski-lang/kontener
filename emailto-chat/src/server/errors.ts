/** API error codes — identical to MailClientError codes in src/core/client.ts. */
export type ApiErrorCode =
  | "unauthorized"
  | "needs_reauth"
  | "not_found"
  | "rate_limited"
  | "conflict"
  | "too_large"
  | "invalid"
  | "server";

export const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  unauthorized: 401,
  needs_reauth: 403,
  not_found: 404,
  rate_limited: 429,
  conflict: 409,
  too_large: 413,
  invalid: 400,
  server: 500,
};

export class ApiError extends Error {
  readonly status: number;
  constructor(
    public readonly code: ApiErrorCode,
    message: string,
    status?: number,
    public readonly headers?: Record<string, string>,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status ?? STATUS_BY_CODE[code];
  }
}

export const notFound = (what = "Not found") => new ApiError("not_found", what);
export const invalid = (msg: string) => new ApiError("invalid", msg);
