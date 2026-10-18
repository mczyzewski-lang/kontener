import { redirect } from "next/navigation";
import { connection } from "next/server";
import { appMode, integrationStatus } from "@/lib/env";

export const metadata = { title: "Konfiguracja" };

function Row({ ok, label, hint }: { ok: boolean; label: string; hint: string }) {
  return (
    <li className="flex gap-3 py-3">
      <span className={ok ? "text-success" : "text-danger"}>{ok ? "✓" : "✗"}</span>
      <div>
        <div className="font-medium">{label}</div>
        <div className="text-sm text-muted">{hint}</div>
      </div>
    </li>
  );
}

/** Shown when neither Supabase nor demo mode is configured — never silently falls back. */
export default async function SetupPage() {
  await connection();
  if (appMode() !== "unconfigured") redirect("/");
  const st = integrationStatus();
  return (
    <main className="mx-auto max-w-lg px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Skonfiguruj Hablo</h1>
      <p className="mt-2 text-muted">
        Aplikacja nie ma jeszcze bazy danych. Uzupełnij zmienne środowiskowe (zobacz <code>.env.example</code> i <code>docs/SETUP.md</code>).
      </p>
      <ul className="mt-8 divide-y divide-line">
        <Row ok={st.supabase} label="Supabase" hint="NEXT_PUBLIC_SUPABASE_URL i NEXT_PUBLIC_SUPABASE_ANON_KEY" />
        <Row ok={st.allowedEmail} label="Dozwolony e-mail" hint="HABLO_ALLOWED_EMAIL — jedyne konto z dostępem" />
        <Row ok={st.serviceRole} label="Klucz service role" hint="SUPABASE_SERVICE_ROLE_KEY — seed treści, webhooki, cache audio" />
        <Row ok={st.anthropic} label="Claude API" hint="ANTHROPIC_API_KEY — historie, ocena odpowiedzi, analiza rozmów" />
        <Row ok={st.elevenAgent} label="ElevenLabs" hint="ELEVENLABS_API_KEY i ELEVENLABS_AGENT_ID — rozmowy głosowe, wymowa" />
      </ul>
      <p className="mt-8 rounded-xl bg-sunken p-4 text-sm text-ink-2">
        Chcesz najpierw obejrzeć aplikację lokalnie? Ustaw <code>HABLO_DEMO_MODE=1</code> — dane zapiszą się w pliku na serwerze, bez logowania. Tryb
        demonstracyjny jest wyraźnie oznaczony i nie udaje integracji głosowej.
      </p>
    </main>
  );
}
