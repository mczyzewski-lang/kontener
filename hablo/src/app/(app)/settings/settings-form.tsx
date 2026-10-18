"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, LogOut } from "lucide-react";
import type { LearningPreferencesRow } from "@/lib/db/types";
import type { IntegrationStatus } from "@/lib/env";
import type { UsageSummary } from "@/lib/usage";
import { api } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Card, Input, Notice, SectionTitle } from "@/components/ui/primitives";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

type Prefs = LearningPreferencesRow;

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3.5">
      <div>
        <div className="text-[15px]">{label}</div>
        {hint && <div className="text-xs text-muted">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-full bg-sunken p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={cn("rounded-full px-3 py-1.5 text-[13px]", value === o.id ? "bg-surface font-medium shadow-sm" : "text-muted")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SettingsForm({
  email,
  mode,
  prefs: initial,
  status,
  usage,
  situations,
}: {
  email: string;
  mode: "supabase" | "demo";
  prefs: Prefs;
  status: IntegrationStatus & { voice: boolean };
  usage: UsageSummary;
  situations: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [prefs, setPrefs] = useState(initial);
  const [saved, setSaved] = useState<string | null>(null);
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  async function save(patch: Partial<Prefs>) {
    setPrefs((p) => ({ ...p, ...patch }));
    try {
      await api("/api/settings", { method: "PATCH", json: patch });
      setSaved("Zapisano");
      setTimeout(() => setSaved(null), 1500);
    } catch (e) {
      setSaved(e instanceof Error ? e.message : "Błąd zapisu");
    }
  }

  async function remove(scope: "transcripts" | "recordings" | "all") {
    try {
      await api("/api/data", { method: "DELETE", json: { scope, confirm: "USUŃ" } });
      setMsg(scope === "all" ? "Usunięto wszystkie dane nauki." : scope === "transcripts" ? "Usunięto transkrypcje." : "Usunięto nagrania.");
      setConfirm("");
      if (scope === "all") router.push("/onboarding");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Błąd");
    }
  }

  const ok = (b: boolean) => <span className={b ? "text-success" : "text-danger"}>{b ? "połączono" : "brak"}</span>;

  return (
    <div className="space-y-8 pb-6">
      {saved && <div className="fixed top-4 left-1/2 z-50 -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-sm text-white">{saved}</div>}

      <section>
        <SectionTitle>Konto</SectionTitle>
        <Card className="divide-y divide-line">
          <Row label={email} hint={mode === "demo" ? "Tryb demonstracyjny — bez logowania" : "Prywatne konto (jedyny dozwolony e-mail)"}>
            {mode === "supabase" && (
              <form action="/api/auth/logout" method="post">
                <Button variant="ghost" size="sm" type="submit">
                  <LogOut /> Wyloguj
                </Button>
              </form>
            )}
          </Row>
        </Card>
      </section>

      <section>
        <SectionTitle>Nauka</SectionTitle>
        <Card className="divide-y divide-line">
          <Row label="Domyślna lekcja">
            <Segmented
              value={prefs.plan_variant}
              options={[
                { id: "quick", label: "10" },
                { id: "standard", label: "30" },
                { id: "deep", label: "45 min" },
              ]}
              onChange={(v) => save({ plan_variant: v, daily_minutes: v === "quick" ? 10 : v === "deep" ? 45 : 30 })}
            />
          </Row>
          <Row label="Tempo nowych słów" hint="Plan i tak zwalnia przy zaległościach">
            <Segmented
              value={prefs.new_words_pace}
              options={[
                { id: "slow", label: "wolno" },
                { id: "normal", label: "normalnie" },
                { id: "fast", label: "szybko" },
              ]}
              onChange={(v) => save({ new_words_pace: v })}
            />
          </Row>
          <Row label="Akcent" hint="Hiszpański z Hiszpanii (castellano)">
            <span className="text-sm text-muted">castellano</span>
          </Row>
          <Row label="Strefa czasowa">
            <span className="text-sm text-muted">{prefs.timezone}</span>
          </Row>
        </Card>
        <div className="mt-3 flex flex-wrap gap-2">
          {situations.map((s) => {
            const on = prefs.focus_situations.includes(s.id);
            return (
              <button
                key={s.id}
                onClick={() => save({ focus_situations: on ? prefs.focus_situations.filter((x) => x !== s.id) : [...prefs.focus_situations, s.id] })}
                className={cn("rounded-full border px-3 py-1.5 text-sm", on ? "border-accent bg-accent-soft text-accent" : "border-line bg-surface text-ink-2")}
              >
                {s.label}
              </button>
            );
          })}
        </div>
        <Button variant="link" className="mt-2 text-sm" onClick={() => router.push("/onboarding?redo=1")}>
          Przejdź ponownie test poziomu
        </Button>
      </section>

      <section>
        <SectionTitle>Nauczyciel głosowy</SectionTitle>
        <Card className="divide-y divide-line">
          <Row label="Tempo mówienia" hint={`${prefs.tutor_speed.toFixed(2)}×`}>
            <input
              type="range"
              min={0.7}
              max={1.2}
              step={0.05}
              value={prefs.tutor_speed}
              onChange={(e) => setPrefs({ ...prefs, tutor_speed: Number(e.target.value) })}
              onPointerUp={() => save({ tutor_speed: prefs.tutor_speed })}
              onKeyUp={() => save({ tutor_speed: prefs.tutor_speed })}
              className="w-36 accent-[var(--color-accent)]"
              aria-label="Tempo mówienia nauczyciela"
            />
          </Row>
          <Row label="Napisy w rozmowie">
            <Switch checked={prefs.show_subtitles} onCheckedChange={(v) => save({ show_subtitles: v })} />
          </Row>
          <Row label="Tłumaczenie w trybie prowadzonym">
            <Switch checked={prefs.show_translation} onCheckedChange={(v) => save({ show_translation: v })} />
          </Row>
        </Card>
      </section>

      <section>
        <SectionTitle>Historia i prywatność</SectionTitle>
        <Card className="divide-y divide-line">
          <Row label="Zapisuj nagrania rozmów" hint="Domyślnie wyłączone — wystarczą transkrypcje. Wymaga agenta z nagrywaniem.">
            <Switch checked={prefs.store_audio} onCheckedChange={(v) => save({ store_audio: v })} />
          </Row>
          {prefs.store_audio && (
            <Row label="Usuwaj nagrania po (dniach)">
              <Input type="number" min={1} max={365} className="h-9 w-20" value={prefs.audio_retention_days} onChange={(e) => save({ audio_retention_days: Number(e.target.value) || 30 })} />
            </Row>
          )}
          <Row label="Usuwaj transkrypcje po (dniach)" hint="Puste = przechowuj zawsze (potrzebne do ponownej analizy)">
            <Input
              type="number"
              min={7}
              className="h-9 w-20"
              value={prefs.transcript_retention_days ?? ""}
              onChange={(e) => save({ transcript_retention_days: e.target.value ? Math.max(7, Number(e.target.value)) : null })}
            />
          </Row>
        </Card>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button asChild variant="secondary">
            <a href="/api/export?format=json">
              <Download /> Eksport JSON
            </a>
          </Button>
          <Button asChild variant="secondary">
            <a href="/api/export?format=csv">
              <Download /> Postępy CSV
            </a>
          </Button>
        </div>
        <Card className="mt-3 space-y-3 p-4">
          <div className="text-sm">
            Usuwanie danych. Wpisz <strong>USUŃ</strong>, aby potwierdzić.
          </div>
          <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="USUŃ" />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Button variant="secondary" size="sm" disabled={confirm !== "USUŃ"} onClick={() => remove("recordings")}>
              Usuń nagrania
            </Button>
            <Button variant="secondary" size="sm" disabled={confirm !== "USUŃ"} onClick={() => remove("transcripts")}>
              Usuń transkrypcje
            </Button>
            <Button variant="danger" size="sm" disabled={confirm !== "USUŃ"} onClick={() => remove("all")}>
              Usuń wszystkie dane
            </Button>
          </div>
          {msg && <p className="text-sm text-muted">{msg}</p>}
        </Card>
      </section>

      <section>
        <SectionTitle>Koszty API</SectionTitle>
        <Card className="divide-y divide-line">
          <Row label="Dziś" hint="Szacunek wg cen katalogowych">
            <span className="tabular-nums">${usage.todayUsd.toFixed(2)}</span>
          </Row>
          <Row label="W tym miesiącu">
            <span className="tabular-nums">${usage.monthUsd.toFixed(2)}</span>
          </Row>
          <Row label="Minuty rozmów dziś">
            <span className="tabular-nums">{usage.conversationMinutesToday.toFixed(1)}</span>
          </Row>
          <Row label="Limit dzienny (USD)">
            <Input type="number" min={0} step={0.5} className="h-9 w-24" value={prefs.daily_cost_limit_usd} onChange={(e) => save({ daily_cost_limit_usd: Number(e.target.value) })} />
          </Row>
          <Row label="Limit miesięczny (USD)">
            <Input type="number" min={0} step={1} className="h-9 w-24" value={prefs.monthly_cost_limit_usd} onChange={(e) => save({ monthly_cost_limit_usd: Number(e.target.value) })} />
          </Row>
          <Row label="Limit minut rozmów dziennie">
            <Input
              type="number"
              min={0}
              className="h-9 w-24"
              value={prefs.daily_conversation_minutes_limit}
              onChange={(e) => save({ daily_conversation_minutes_limit: Number(e.target.value) })}
            />
          </Row>
        </Card>
        <p className="mt-2 text-xs text-muted">Koszty są szacunkowe (ElevenLabs zależy od planu). Dokładne rozliczenie znajdziesz w panelach dostawców.</p>
      </section>

      <section>
        <SectionTitle>Status integracji</SectionTitle>
        <Card className="divide-y divide-line text-sm">
          <Row label="Baza danych">{status.mode === "supabase" ? ok(true) : <span className="text-warn">lokalna (demo)</span>}</Row>
          <Row label="Claude API (historie, ocena, analiza)">{status.aiMock ? <span className="text-warn">TRYB TESTOWY</span> : ok(status.anthropic)}</Row>
          <Row label="ElevenLabs — rozmowy głosowe">{ok(status.voice)}</Row>
          <Row label="ElevenLabs — wymowa i rozpoznawanie mowy">{ok(status.elevenlabs && status.voices)}</Row>
          <Row label="Webhook po rozmowie">{ok(status.elevenWebhook)}</Row>
          <Row label="Klucz service role">{status.mode === "demo" ? <span className="text-muted">n/d</span> : ok(status.serviceRole)}</Row>
        </Card>
        {(!status.voice || !status.anthropic) && (
          <Notice className="mt-3">Brakujące klucze dodaj w zmiennych środowiskowych hostingu — instrukcja w docs/SETUP.md.</Notice>
        )}
      </section>
    </div>
  );
}
