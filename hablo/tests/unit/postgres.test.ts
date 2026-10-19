import { describe, expect, it } from "vitest";
import { checkCredentials, createSessionToken, userIdForEmail, verifySessionToken, isRateLimited, recordFailure } from "@/lib/auth/password";
import { contains, eq, inList, isNull } from "@/lib/db/db";
import { freshDb, USER } from "./helpers";

const CFG = { allowedEmail: "me@example.com", password: "correct horse" };

describe("password sign-in (Postgres mode)", () => {
  it("accepts only the allowed e-mail with the right password", () => {
    expect(checkCredentials(" Me@Example.com ", "correct horse", CFG)).toBe(true);
    expect(checkCredentials("other@example.com", "correct horse", CFG)).toBe(false);
    expect(checkCredentials("me@example.com", "wrong", CFG)).toBe(false);
  });

  it("session cookies are signed, expire, and die when the password changes", () => {
    const now = Date.UTC(2026, 9, 19);
    const token = createSessionToken(CFG, now);
    expect(verifySessionToken(token, CFG, now + 1000)).toBe(true);
    expect(verifySessionToken(token, { ...CFG, password: "new password" }, now)).toBe(false);
    expect(verifySessionToken(token, { ...CFG, allowedEmail: "x@example.com" }, now)).toBe(false);
    expect(verifySessionToken(token, CFG, now + 61 * 86_400_000)).toBe(false);
    const [exp, sig] = token.split(".");
    expect(verifySessionToken(`${Number(exp) + 1}.${sig}`, CFG, now)).toBe(false);
    expect(verifySessionToken(undefined, CFG, now)).toBe(false);
  });

  it("derives a stable uuid for the account", () => {
    expect(userIdForEmail("Me@example.com")).toBe(userIdForEmail("me@example.com"));
    expect(userIdForEmail("me@example.com")).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("limits repeated failed attempts", () => {
    const ip = "203.0.113.7";
    for (let i = 0; i < 10; i++) recordFailure(ip);
    expect(isRateLimited(ip)).toBe(true);
    expect(isRateLimited("203.0.113.8")).toBe(false);
  });
});

describe.skipIf(!process.env.TEST_DATABASE_URL)("PostgresDb", () => {
  it("returns the same shapes as Supabase: ISO timestamps, dates, numbers, jsonb, arrays", async () => {
    const db = await freshDb();
    const [plan] = await db.insert("daily_plans", {
      user_id: USER,
      plan_date: "2026-10-19",
      variant: "standard",
      target_minutes: 30,
      rationale: ["a", "b"],
      inputs: { due: 3, nested: { ok: true } },
    });
    expect(plan.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(plan.plan_date).toBe("2026-10-19");
    expect(plan.created_at).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
    expect(plan.inputs).toEqual({ due: 3, nested: { ok: true } });
    expect(plan.rationale).toEqual(["a", "b"]);
    const prefs = (await db.select("learning_preferences", { where: [eq("user_id", USER)] }))[0];
    expect(prefs.tutor_speed).toBe(0.9);
    expect(prefs.focus_situations).toEqual([]);
  });

  it("upsert updates only the given columns; ignoreDuplicates keeps the row", async () => {
    const db = await freshDb();
    await db.upsert("learning_preferences", { user_id: USER, daily_minutes: 45 });
    let p = (await db.select("learning_preferences", { where: [eq("user_id", USER)] }))[0];
    expect(p.daily_minutes).toBe(45);
    expect(p.timezone).toBe("Europe/Madrid");
    await db.upsert("learning_preferences", { user_id: USER, daily_minutes: 10 }, { ignoreDuplicates: true });
    p = (await db.select("learning_preferences", { where: [eq("user_id", USER)] }))[0];
    expect(p.daily_minutes).toBe(45);
  });

  it("supports in / contains / is null filters, ordering, limits, count and delete", async () => {
    const db = await freshDb();
    const words = await db.select("vocabulary_entries", { where: [isNull("owner_id"), contains("topics", ["food"])], order: [{ col: "frequency_rank" }], limit: 3 });
    expect(words.length).toBeGreaterThan(0);
    expect(words.every((w) => w.topics.includes("food"))).toBe(true);
    const ids = words.map((w) => w.id);
    expect(await db.count("vocabulary_entries", [inList("id", ids)])).toBe(ids.length);
    await db.insert("learning_events", [
      { user_id: USER, type: "review", minutes: 2, local_date: "2026-10-19" },
      { user_id: USER, type: "story", minutes: 5, local_date: "2026-10-19", payload: { id: 1 } },
    ]);
    expect(await db.remove("learning_events", [eq("user_id", USER), eq("type", "review")])).toBe(1);
    expect(await db.count("learning_events", [eq("user_id", USER)])).toBe(1);
  });

  it("rejects unknown columns instead of silently dropping data", async () => {
    const db = await freshDb();
    await expect(db.update("profiles", [eq("id", USER)], { nope: 1 } as never)).rejects.toThrow(/Unknown column/);
  });
});
