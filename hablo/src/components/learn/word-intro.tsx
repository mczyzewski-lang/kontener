"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import type { EntryDto } from "@/lib/services/review";
import { PlayButton } from "@/components/play-button";
import { Button } from "@/components/ui/button";
import { Badge, Textarea } from "@/components/ui/primitives";
import { api } from "@/lib/client/api";
import { useCapabilities } from "@/components/capabilities";

/** First encounter with a word: sound, meaning, examples, collocations, optional memory-palace scene. */
export function WordIntro({ entry, onContinue }: { entry: EntryDto; onContinue: () => void }) {
  const caps = useCapabilities();
  const [scene, setScene] = useState<string | null>(null);
  const [own, setOwn] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="animate-rise space-y-6">
      <div className="text-center">
        <Badge tone="accent">{entry.kind === "phrase" ? "Nowy zwrot" : "Nowe słowo"}</Badge>
        <div className="mt-4 font-serif text-[40px] leading-tight" lang="es">
          {entry.display}
        </div>
        <div className="mt-1 text-lg text-ink-2">{entry.translations.join(", ")}</div>
        <div className="mt-1 text-xs text-faint">
          {entry.posLabel}
          {entry.rank ? ` · #${entry.rank} w rankingu częstotliwości` : ""}
        </div>
        <div className="mt-4 flex justify-center">
          <PlayButton text={entry.lemma} size="lg" />
        </div>
      </div>

      <div className="space-y-3">
        {entry.examples.map((ex) => (
          <div key={ex.es} className="flex items-start gap-3 rounded-xl bg-sunken p-3">
            <PlayButton text={ex.es} size="sm" slow={false} autoLabel={false} />
            <div>
              <div className="font-serif text-[17px]" lang="es">
                {ex.es}
              </div>
              <div className="text-sm text-muted">{ex.pl}</div>
            </div>
          </div>
        ))}
      </div>

      {(entry.collocations.length > 0 || entry.forms.length > 0 || entry.note) && (
        <div className="space-y-2 text-sm">
          {entry.collocations.length > 0 && (
            <div>
              <span className="text-muted">Typowe połączenia: </span>
              <span lang="es">{entry.collocations.join(" · ")}</span>
            </div>
          )}
          {entry.forms.length > 0 && entry.kind === "word" && (
            <div>
              <span className="text-muted">Formy: </span>
              <span lang="es">{entry.forms.slice(0, 8).join(", ")}</span>
            </div>
          )}
          {entry.note && <div className="rounded-lg bg-accent-soft px-3 py-2 text-[#8a2f1d]">{entry.note}</div>}
        </div>
      )}

      <details className="rounded-xl border border-line px-4 py-3">
        <summary className="cursor-pointer text-sm font-medium">Pałac pamięci — skojarzenie</summary>
        <div className="mt-3 space-y-3">
          {scene && <p className="whitespace-pre-line text-sm leading-relaxed">{scene}</p>}
          {caps.ai && !scene && (
            <Button
              variant="soft"
              size="sm"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setErr(null);
                try {
                  const r = await api<{ scene: string }>(`/api/vocabulary/${entry.id}`, { method: "POST", json: { action: "mnemonic" } });
                  setScene(r.scene);
                } catch (e) {
                  setErr(e instanceof Error ? e.message : "Błąd");
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Sparkles /> Zaproponuj absurdalną scenę
            </Button>
          )}
          <Textarea placeholder="Twoje własne skojarzenie…" value={own} onChange={(e) => setOwn(e.target.value)} className="min-h-16 text-sm" />
          <Button
            variant="secondary"
            size="sm"
            disabled={own.trim().length < 3 || saved}
            onClick={async () => {
              await api(`/api/vocabulary/${entry.id}`, { method: "POST", json: { action: "association", text: own } });
              setSaved(true);
            }}
          >
            {saved ? "Zapisane" : "Zapisz skojarzenie"}
          </Button>
          {err && <p className="text-sm text-danger">{err}</p>}
        </div>
      </details>

      <Button size="lg" className="w-full" onClick={onContinue}>
        Ćwicz to słowo
      </Button>
    </div>
  );
}
