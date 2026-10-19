import "server-only";
import { redirect } from "next/navigation";
import { connection, NextResponse } from "next/server";
import { appMode, env, isEmailAllowed, type AppMode } from "@/lib/env";
import type { Db } from "@/lib/db/db";
import { eq } from "@/lib/db/db";
import { LocalDb } from "@/lib/db/local";
import { SupabaseDb } from "@/lib/db/supabase";
import { PostgresDb, getPool } from "@/lib/db/postgres";
import { SESSION_COOKIE, userIdForEmail, verifySessionToken } from "@/lib/auth/password";
import { cookies } from "next/headers";
import { ensureContentSeeded, seedContent } from "@/lib/db/seed";
import { createServiceClient, createUserClient } from "@/lib/supabase/server";
import { HttpError } from "@/lib/http-error";

export const DEMO_USER_ID = "00000000-0000-4000-8000-000000000001";

export interface Session {
  userId: string;
  email: string;
  db: Db;
  mode: Exclude<AppMode, "unconfigured">;
}

let localDb: LocalDb | null = null;
function getLocalDb(): LocalDb {
  if (!localDb) localDb = new LocalDb(env.dataFile());
  return localDb;
}

async function getPostgresDb(): Promise<PostgresDb> {
  return new PostgresDb(await getPool(env.databaseUrl()!));
}

/** Service-level Db for trusted server work without a user session (webhooks). */
export async function getServiceDb(): Promise<Db | null> {
  const mode = appMode();
  if (mode === "demo") return getLocalDb();
  if (mode === "postgres") return getPostgresDb();
  const client = createServiceClient();
  return client ? new SupabaseDb(client) : null;
}

/** Password-mode credentials (null outside that mode). */
export function passwordConfig() {
  if (appMode() !== "postgres") return null;
  return { allowedEmail: env.allowedEmail()!, password: env.password()!, secret: env.sessionSecret() };
}

async function ensureSeeded(db: Db) {
  if (await ensureContentSeeded(db)) return;
  // Content tables are read-only for users; seed with the service role (or locally).
  const writer = db.kind === "supabase" ? await getServiceDb() : db;
  if (!writer) {
    throw new Error(
      "Content tables are empty. Run `npm run db:seed` or set SUPABASE_SERVICE_ROLE_KEY so Hablo can seed them.",
    );
  }
  await seedContent(writer);
  await ensureContentSeeded(db);
}

/**
 * Returns the authenticated session or null. Authorization is enforced here on
 * the server: a valid Supabase session for any e-mail other than
 * HABLO_ALLOWED_EMAIL is rejected and signed out; in Postgres mode only a
 * cookie signed for the allowed e-mail and current password is accepted.
 */
export async function getSession(): Promise<Session | null> {
  const mode = appMode();
  if (mode === "unconfigured") return null;
  if (mode === "demo") {
    const db = getLocalDb();
    await ensureSeeded(db);
    await db.upsert("profiles", { id: DEMO_USER_ID, email: "demo@hablo.local" }, { ignoreDuplicates: true });
    return { userId: DEMO_USER_ID, email: "demo@hablo.local", db, mode };
  }
  if (mode === "postgres") {
    const cfg = passwordConfig()!;
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    if (!verifySessionToken(token, cfg)) return null;
    const db = await getPostgresDb();
    await ensureSeeded(db);
    const userId = userIdForEmail(cfg.allowedEmail);
    await db.upsert("profiles", { id: userId, email: cfg.allowedEmail }, { ignoreDuplicates: true });
    return { userId, email: cfg.allowedEmail, db, mode };
  }
  const client = await createUserClient();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  if (!isEmailAllowed(data.user.email)) {
    await client.auth.signOut();
    return null;
  }
  const db = new SupabaseDb(client);
  await ensureSeeded(db);
  await db.upsert("profiles", { id: data.user.id, email: data.user.email! }, { ignoreDuplicates: true });
  return { userId: data.user.id, email: data.user.email!, db, mode };
}

/**
 * For pages: redirect to /login (or /setup) without a valid session, and to
 * /onboarding until onboarding is finished. Pages must call this themselves —
 * in the App Router a page renders in parallel with its layout, so a layout
 * redirect alone does not stop page code from running.
 */
export async function requirePageSession(opts: { allowNotOnboarded?: boolean } = {}): Promise<Session> {
  // Always render per request: configuration and data are only known at runtime.
  await connection();
  if (appMode() === "unconfigured") redirect("/setup");
  const s = await getSession();
  if (!s) redirect("/login");
  if (!opts.allowNotOnboarded) {
    const profile = (await s.db.select("profiles", { where: [eq("id", s.userId)], limit: 1 }))[0];
    if (!profile?.onboarded_at) redirect("/onboarding");
  }
  return s;
}

export { HttpError };

/** For route handlers: wraps a handler with authentication and JSON error handling. */
export function withSession<Ctx>(
  handler: (req: Request, session: Session, ctx: Ctx) => Promise<Response | unknown>,
) {
  return async (req: Request, ctx: Ctx): Promise<Response> => {
    try {
      const session = await getSession();
      if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      const out = await handler(req, session, ctx);
      return out instanceof Response ? out : NextResponse.json(out ?? { ok: true });
    } catch (e) {
      if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
      console.error(e);
      return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
    }
  };
}
