import { redirect } from "next/navigation";
import { connection } from "next/server";
import { appMode } from "@/lib/env";
import { getSession } from "@/lib/session";
import { LoginForm } from "./login-form";

export const metadata = { title: "Logowanie" };

const ERRORS: Record<string, string> = {
  forbidden: "To konto nie ma dostępu do Hablo. To prywatna aplikacja dla jednej osoby.",
  link: "Link logowania wygasł lub jest nieprawidłowy. Poproś o nowy.",
  oauth: "Logowanie przez Google się nie udało.",
  config: "Logowanie wymaga konfiguracji Supabase.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await connection();
  const mode = appMode();
  if (mode === "unconfigured") redirect("/setup");
  if (mode === "demo" || (await getSession())) redirect("/");
  const { error } = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      <div className="mb-10">
        <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-accent font-serif text-2xl text-white">h</span>
        <h1 className="mt-6 text-3xl font-semibold tracking-tight">Hablo</h1>
        <p className="mt-1 text-muted">Twój prywatny nauczyciel hiszpańskiego.</p>
      </div>
      {error && ERRORS[error] && <p className="mb-4 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{ERRORS[error]}</p>}
      <LoginForm />
    </main>
  );
}
