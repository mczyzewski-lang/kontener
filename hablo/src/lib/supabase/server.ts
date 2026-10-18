import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

/** Supabase client bound to the signed-in user's session cookies (RLS applies). */
export async function createUserClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies();
  return createServerClient(env.supabaseUrl()!, env.supabaseAnonKey()!, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component: cookies are refreshed by proxy.ts instead.
        }
      },
    },
  });
}

/**
 * Service-role client. Bypasses RLS — use only for trusted server work that has
 * no user session (signed ElevenLabs webhooks, content seeding, TTS cache) and
 * always filter explicitly by user_id.
 */
export function createServiceClient(): SupabaseClient | null {
  const url = env.supabaseUrl();
  const key = env.supabaseServiceKey();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
