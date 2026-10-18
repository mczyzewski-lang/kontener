import { LocalDb } from "@/lib/db/local";
import { seedContent } from "@/lib/db/seed";
import { setFuzzForTests } from "@/lib/learning/memory";
import type { Session } from "@/lib/session";

export const USER = "00000000-0000-4000-8000-0000000000aa";

/** Fresh in-memory database with all content seeded and a profile/preferences row. */
export async function freshDb() {
  setFuzzForTests(false);
  const db = new LocalDb(null);
  await seedContent(db);
  await db.insert("profiles", { id: USER, email: "me@example.com", start_level: "beginner", onboarded_at: new Date().toISOString() });
  await db.upsert("learning_preferences", { user_id: USER, timezone: "Europe/Madrid" });
  return db;
}

export async function freshSession(): Promise<Session> {
  return { userId: USER, email: "me@example.com", db: await freshDb(), mode: "demo" };
}
