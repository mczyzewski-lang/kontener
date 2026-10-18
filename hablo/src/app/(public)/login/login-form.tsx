"use client";

import { useState } from "react";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/primitives";
import { api } from "@/lib/client/api";

export function LoginForm() {
  const [email, setEmail] = useState("");
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
        <Button type="submit" className="w-full" size="lg" disabled={busy}>
          <Mail /> Wyślij link do logowania
        </Button>
      </form>
      <div className="flex items-center gap-3 text-xs text-faint">
        <div className="h-px flex-1 bg-line" /> albo <div className="h-px flex-1 bg-line" />
      </div>
      <Button asChild variant="secondary" size="lg" className="w-full">
        <a href="/api/auth/google">Zaloguj przez Google</a>
      </Button>
      {msg && <p className={msg.ok ? "text-sm text-success" : "text-sm text-danger"}>{msg.text}</p>}
    </div>
  );
}
