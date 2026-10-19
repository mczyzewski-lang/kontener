"use client";

import { useState } from "react";
import { LogIn, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/primitives";
import { api } from "@/lib/client/api";

export function LoginForm({ password: withPassword }: { password: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-4">
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            if (withPassword) {
              await api("/api/auth/login", { method: "POST", json: { email, password } });
              // Full navigation so the server renders with the new session cookie.
              // eslint-disable-next-line @next/next/no-location-assign-relative-destination
              window.location.assign("/");
              return;
            }
            const r = await api<{ message: string }>("/api/auth/login", { method: "POST", json: { email } });
            setMsg({ ok: true, text: r.message });
          } catch (err) {
            setMsg({ ok: false, text: err instanceof Error ? err.message : "Błąd" });
          } finally {
            setBusy(false);
          }
        }}
      >
        <Input type="email" required autoComplete="email" placeholder="twój@email.pl" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="E-mail" />
        {withPassword && (
          <Input
            type="password"
            required
            autoComplete="current-password"
            placeholder="Hasło"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-label="Hasło"
          />
        )}
        <Button type="submit" className="w-full" size="lg" disabled={busy}>
          {withPassword ? (
            <>
              <LogIn /> Zaloguj
            </>
          ) : (
            <>
              <Mail /> Wyślij link do logowania
            </>
          )}
        </Button>
      </form>
      {!withPassword && (
        <>
      <div className="flex items-center gap-3 text-xs text-faint">
        <div className="h-px flex-1 bg-line" /> albo <div className="h-px flex-1 bg-line" />
      </div>
      <Button asChild variant="secondary" size="lg" className="w-full">
        <a href="/api/auth/google">Zaloguj przez Google</a>
      </Button>
        </>
      )}
      {msg && <p className={msg.ok ? "text-sm text-success" : "text-sm text-danger"}>{msg.text}</p>}
    </div>
  );
}
