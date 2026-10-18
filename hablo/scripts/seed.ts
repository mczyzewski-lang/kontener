/**
 * Seeds the shared content tables in Supabase from /content (idempotent upserts).
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... HABLO_ALLOWED_EMAIL=you@example.com npx tsx scripts/seed.ts
 * Also registers HABLO_ALLOWED_EMAIL in private.allowed_emails (sign-up allowlist).
 */
import { createClient } from "@supabase/supabase-js";
import { SupabaseDb } from "../src/lib/db/supabase";
import { seedContent } from "../src/lib/db/seed";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  const client = createClient(url, key, { auth: { persistSession: false } });
  const res = await seedContent(new SupabaseDb(client));
  console.log(`Seeded ${res.entries} vocabulary entries, ${res.topics} grammar topics, ${res.scenarios} scenarios.`);
  const email = process.env.HABLO_ALLOWED_EMAIL?.trim().toLowerCase();
  if (email) {
    const { error } = await client.schema("private").from("allowed_emails").upsert({ email });
    if (error) {
      console.warn(
        `Could not register the allowed e-mail through the API (${error.message}).\n` +
          `Run in the Supabase SQL editor:  insert into private.allowed_emails (email) values ('${email}') on conflict do nothing;`,
      );
    } else console.log(`Allowed e-mail registered: ${email}`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
