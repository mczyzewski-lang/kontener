/**
 * Server environment. Validated lazily (at request time, on first use) so `next build`
 * succeeds without any secrets present. Never import this from client components.
 */
import { z } from "zod";

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() ? v.trim() : undefined));

const emptyToUndefined = (v: unknown) => (typeof v === "string" && !v.trim() ? undefined : v);

const schema = z.object({
  APP_URL: z.url().transform((u) => u.replace(/\/+$/, "")),
  DATABASE_URL: z.string().min(1),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  TOKEN_ENCRYPTION_KEY: z.string().refine((v) => {
    try {
      return Buffer.from(v, "base64").length === 32;
    } catch {
      return false;
    }
  }, "TOKEN_ENCRYPTION_KEY must be 32 bytes, base64-encoded (openssl rand -base64 32)"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  CRON_SECRET: optionalString,
  GMAIL_PUBSUB_TOPIC: optionalString.refine(
    (v) => !v || /^projects\/[^/]+\/topics\/[^/]+$/.test(v),
    "GMAIL_PUBSUB_TOPIC must look like projects/<project-id>/topics/<topic>",
  ),
  PUBSUB_SERVICE_ACCOUNT_EMAIL: optionalString,
  PUBSUB_AUDIENCE: optionalString,
  PUBSUB_VERIFICATION_TOKEN: optionalString,
  MAX_BACKFILL_THREADS: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().default(1500)),
  MAX_UPLOAD_MB: z.preprocess(emptyToUndefined, z.coerce.number().positive().optional()),
});

export interface ServerEnv {
  APP_URL: string;
  appOrigin: string;
  DATABASE_URL: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  TOKEN_ENCRYPTION_KEY: string;
  SESSION_SECRET: string;
  CRON_SECRET?: string;
  GMAIL_PUBSUB_TOPIC?: string;
  PUBSUB_SERVICE_ACCOUNT_EMAIL?: string;
  PUBSUB_AUDIENCE: string;
  PUBSUB_VERIFICATION_TOKEN?: string;
  MAX_BACKFILL_THREADS: number;
  MAX_UPLOAD_MB: number;
  isProduction: boolean;
  googleRedirectUri: string;
}

export class EnvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnvError";
  }
}

let cached: ServerEnv | null = null;

/** Validated env. Throws EnvError (→ 500 "server misconfigured") when something is missing. */
export function getEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    // Only variable names are reported — never values.
    const names = [...new Set(parsed.error.issues.map((i) => String(i.path[0] ?? "?")))].join(", ");
    throw new EnvError(`Invalid or missing environment variables: ${names}`);
  }
  const e = parsed.data;
  const onVercel = !!process.env.VERCEL;
  cached = {
    ...e,
    appOrigin: new URL(e.APP_URL).origin,
    PUBSUB_AUDIENCE: e.PUBSUB_AUDIENCE ?? `${e.APP_URL}/api/webhooks/gmail`,
    // Vercel limits function request bodies to 4.5 MB.
    MAX_UPLOAD_MB: e.MAX_UPLOAD_MB ?? (onVercel ? 4 : 20),
    isProduction: process.env.NODE_ENV === "production",
    googleRedirectUri: `${e.APP_URL}/api/auth/google/callback`,
  };
  return cached;
}

/** Tests only: forget the cached env after mutating process.env. */
export function resetEnvCache(): void {
  cached = null;
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}
