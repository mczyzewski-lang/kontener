/**
 * Integration-test database: the local `emailtochat_test` Postgres DB.
 * Applies migrations once (prisma migrate deploy) when needed and truncates all tables between
 * tests. When Postgres is unreachable the suites are skipped with a clear message.
 */
import "./env";
import { execSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import { getDb } from "@/server/db";
import { TEST_DATABASE_URL } from "./env";

const ROOT = process.cwd();

async function migrationsApplied(): Promise<boolean> {
  const dirs = readdirSync(path.join(ROOT, "prisma/migrations"), { withFileTypes: true }).filter((d) => d.isDirectory()).length;
  try {
    const exists = await getDb().$queryRaw<Array<{ t: string | null }>>`SELECT to_regclass('public._prisma_migrations')::text AS t`;
    if (!exists[0]?.t) return false;
    const rows = await getDb().$queryRaw<Array<{ n: bigint }>>`SELECT count(*)::bigint AS n FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`;
    return Number(rows[0]?.n ?? 0) >= dirs;
  } catch {
    return false;
  }
}

export async function setupTestDb(): Promise<{ ok: boolean; reason?: string }> {
  try {
    await getDb().$queryRaw`SELECT 1`;
  } catch {
    const reason = `Postgres not reachable at ${TEST_DATABASE_URL.replace(/:[^:@/]+@/, ":***@")} — skipping DB integration tests (start it with: pg_ctlcluster 16 main start)`;
    console.warn(reason);
    return { ok: false, reason };
  }
  if (!(await migrationsApplied())) {
    execSync("npx prisma migrate deploy", {
      cwd: ROOT,
      env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
      stdio: "pipe",
    });
  }
  return { ok: true };
}

const TABLES = [
  "AttachmentMetadata",
  "ThreadParticipant",
  "EmailMessage",
  "EmailThread",
  "Contact",
  "Draft",
  "OutboundMessage",
  "SyncState",
  "MailAccount",
  "Session",
  "UserPreference",
  "User",
];

export async function resetDb(): Promise<void> {
  await getDb().$executeRawUnsafe(`TRUNCATE ${TABLES.map((t) => `"${t}"`).join(", ")} CASCADE`);
}
