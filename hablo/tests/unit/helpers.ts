import path from "node:path";
import type pg from "pg";
import type { Db } from "@/lib/db/db";
import { LocalDb } from "@/lib/db/local";
import { PostgresDb, createPool, migrate } from "@/lib/db/postgres";
import { seedContent } from "@/lib/db/seed";
import { setFuzzForTests } from "@/lib/learning/memory";
import type { Session } from "@/lib/session";

export const USER = "00000000-0000-4000-8000-0000000000aa";

// With TEST_DATABASE_URL set (`npm run test:pg`) every test runs against a real,
// emptied PostgreSQL database instead of the in-memory store.
let pool: pg.Pool | null = null;
async function emptyPostgres(url: string): Promise<Db> {
  if (!pool) {
    pool = createPool(url);
    await migrate(pool, path.resolve("postgres"));
  }
  const { rows } = await pool.query(
    "select tablename from pg_tables where schemaname = 'public' and tablename <> 'hablo_migrations'",
  );
  await pool.query(`truncate ${rows.map((r) => `public."${r.tablename}"`).join(", ")} cascade`);
  return new PostgresDb(pool);
}

/** Fresh database with all content seeded and a profile/preferences row. */
export async function freshDb() {
  setFuzzForTests(false);
  const url = process.env.TEST_DATABASE_URL;
  const db = url ? await emptyPostgres(url) : new LocalDb(null);
  await seedContent(db);
  await db.insert("profiles", { id: USER, email: "me@example.com", start_level: "beginner", onboarded_at: new Date().toISOString() });
  await db.upsert("learning_preferences", { user_id: USER, timezone: "Europe/Madrid" });
  return db;
}

export async function freshSession(): Promise<Session> {
  return { userId: USER, email: "me@example.com", db: await freshDb(), mode: "demo" };
}
