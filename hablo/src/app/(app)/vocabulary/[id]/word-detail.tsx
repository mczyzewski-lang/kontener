"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Sparkles } from "lucide-react";
import type { EntryDto } from "@/lib/services/review";
import { api } from "@/lib/client/api";
import { PlayButton } from "@/components/play-button";
import { Button } from "@/components/ui/button";
import { Badge, Card, Notice, SectionTitle, Textarea } from "@/components/ui/primitives";
import { useCapabilities } from "@/components/capabilities";

interface Detail {
  entry: EntryDto;
  skills: { skill: "listening" | "recall" | "speaking"; competence: string; due: string | null; stability: number; reps: number; lapses: number; correct: number; incorrect: number; spontaneous: number; claimed: boolean; firstSeen: string | null }[];
  history: { at: string; skill: string; type: string; correct: boolean; scheduled: boolean; source: string; assisted: boolean }[];
  associations: { source: "ai" | "user"; scene: string }[];
}

const SKILL = { listening: "Rozpoznaję ze słuchu", recall: "Przypominam sobie", speaking: "Używam w mowie" };
const COMP = { none: "jeszcze nie", learning: "w nauce", solid: "utrwalone" } as Record<string, string>;
const fmt = (d: string) => new Date(d).toLocaleDateString("pl-PL", { day: "numeric", month: "short" });

export function WordDetail({ id }: { id: string }) {
  const caps = useCapabilities();
  const [d, setD] = useState<Detail | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [own, setOwn] = useState("");
  const [busy, setBusy] = useState(false);
  const load = () => api<Detail>(`/api/vocabulary/${id}`).then(setD).catch((e) => setNote(e.message));
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!d)
    return (
      <div className="flex justify-center py-20">
        {note ? <p className="text-danger">{note}</p> : <Loader2 className="size-6 animate-spin text-muted" />}
      </div>
    );
  const e = d.entry;
  const anyProgress = d.skills.some((s) => s.reps > 0);

  async function act(body: object) {
    setBusy(true);
    try {
      const r = await api<{ note?: string; scene?: string }>(`/api/vocabulary/${id}`, { method: "POST", json: body });
      if (r.note) setNote(r.note);
      await load();
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Błąd");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="animate-fade-in space-y-6">
      <Link href="/vocabulary" className="inline-flex items-center gap-1 text-sm text-muted">
        <ArrowLeft className="size-4" /> Słownictwo
      </Link>
      <header>
        <div className="flex items-center gap-2">
          <Badge>{e.posLabel}</Badge>
          {e.rank && <Badge>#{e.rank} częstotliwości</Badge>}
        </div>
        <div className="mt-3 flex items-center gap-3">
          <h1 className="font-serif text-4xl" lang="es">
            {e.display}
          </h1>
          <PlayButton text={e.lemma} />
        </div>
        <p className="mt-1 text-lg text-ink-2">{e.translations.join("; ")}</p>
      </header>
      {e.note && <Notice tone="accent">{e.note}</Notice>}

      <section>
        <SectionTitle>Przykłady</SectionTitle>
        <div className="space-y-2">
          {e.examples.map((x) => (
            <div key={x.es} className="flex items-start gap-3">
              <PlayButton text={x.es} size="sm" slow={false} autoLabel={false} />
              <div>
                <div className="font-serif text-[17px]" lang="es">
                  {x.es}
                </div>
                <div className="text-sm text-muted">{x.pl}</div>
              </div>
            </div>
          ))}
        </div>
      </section>
      {(e.collocations.length > 0 || e.forms.length > 0) && (
        <section className="space-y-2 text-[15px]">
          {e.collocations.length > 0 && (
            <div>
              <span className="text-muted">Kolokacje: </span>
              <span lang="es">{e.collocations.join(" · ")}</span>
            </div>
          )}
          {e.forms.length > 0 && (
            <div>
              <span className="text-muted">Formy: </span>
              <span lang="es">{e.forms.join(", ")}</span>
            </div>
          )}
        </section>
      )}

      <section>
        <SectionTitle>Trzy kompetencje</SectionTitle>
        <Card className="divide-y divide-line">
          {d.skills.map((s) => (
            <div key={s.skill} className="flex items-center justify-between gap-3 px-4 py-3">
              <div>
                <div className="font-medium">{SKILL[s.skill]}</div>
                <div className="text-xs text-muted">
                  {s.reps > 0
                    ? `${s.correct} poprawnie · ${s.incorrect} błędnie${s.skill === "speaking" ? ` · ${s.spontaneous}× samodzielnie w rozmowie` : ""}${s.due ? ` · następna powtórka ${fmt(s.due)}` : ""}`
                    : s.claimed
                      ? "oznaczone jako znane — czeka na weryfikację"
                      : "brak prób"}
                </div>
              </div>
              <Badge tone={s.competence === "solid" ? "success" : s.competence === "learning" ? "warn" : "neutral"}>{COMP[s.competence]}</Badge>
            </div>
          ))}
        </Card>
        {!anyProgress && (
          <Button variant="secondary" className="mt-3 w-full" disabled={busy} onClick={() => act({ action: "known" })}>
            Znam to słowo — zweryfikuj w powtórce
          </Button>
        )}
        {note && <p className="mt-2 text-sm text-muted">{note}</p>}
      </section>

      <section>
        <SectionTitle>Pałac pamięci</SectionTitle>
        <div className="space-y-3">
          {d.associations.map((a) => (
            <Notice key={a.source}>
              <div className="text-xs text-muted">{a.source === "ai" ? "Scena zaproponowana przez AI" : "Twoje skojarzenie"}</div>
              <div className="mt-1 whitespace-pre-line">{a.scene}</div>
            </Notice>
          ))}
          {caps.ai && !d.associations.some((a) => a.source === "ai") && (
            <Button variant="soft" size="sm" disabled={busy} onClick={() => act({ action: "mnemonic" })}>
              <Sparkles /> Zaproponuj scenę
            </Button>
          )}
          <Textarea placeholder="Zapisz własne skojarzenie…" value={own} onChange={(ev) => setOwn(ev.target.value)} className="min-h-16" />
          <Button variant="secondary" size="sm" disabled={busy || own.trim().length < 3} onClick={() => act({ action: "association", text: own }).then(() => setOwn(""))}>
            Zapisz skojarzenie
          </Button>
        </div>
      </section>

      {d.history.length > 0 && (
        <section>
          <SectionTitle>Historia prób</SectionTitle>
          <ul className="space-y-1 text-sm">
            {d.history.map((h, i) => (
              <li key={i} className="flex justify-between gap-3 text-ink-2">
                <span>
                  {fmt(h.at)} · {SKILL[h.skill as keyof typeof SKILL] ?? h.skill} · {h.type.replace(/_/g, " ")}
                  {h.assisted ? " · z podpowiedzią" : ""}
                  {!h.scheduled ? " · bez wpływu na harmonogram" : ""}
                </span>
                <span className={h.correct ? "text-success" : "text-danger"}>{h.correct ? "✓" : "✗"}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
