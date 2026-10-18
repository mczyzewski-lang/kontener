"use client";

import { useState } from "react";
import { api } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Card, Input } from "@/components/ui/primitives";

const POS = [
  { id: "n.m", label: "rzeczownik (m)" },
  { id: "n.f", label: "rzeczownik (ż)" },
  { id: "v", label: "czasownik" },
  { id: "adj", label: "przymiotnik" },
  { id: "adv", label: "przysłówek" },
  { id: "phrase", label: "zwrot" },
  { id: "other", label: "inne" },
];

export function AddWord({ onAdded }: { onAdded: () => void }) {
  const [lemma, setLemma] = useState("");
  const [pos, setPos] = useState("n.m");
  const [translation, setTranslation] = useState("");
  const [exampleEs, setExampleEs] = useState("");
  const [examplePl, setExamplePl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Card className="animate-rise space-y-3 p-4">
      <Input placeholder="Słowo po hiszpańsku (np. enchufe)" value={lemma} onChange={(e) => setLemma(e.target.value)} lang="es" />
      <select value={pos} onChange={(e) => setPos(e.target.value)} className="h-12 w-full rounded-xl border border-line bg-surface px-3" aria-label="Część mowy">
        {POS.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
      <Input placeholder="Tłumaczenie (np. gniazdko)" value={translation} onChange={(e) => setTranslation(e.target.value)} />
      <Input placeholder="Przykład po hiszpańsku (opcjonalnie)" value={exampleEs} onChange={(e) => setExampleEs(e.target.value)} lang="es" />
      <Input placeholder="Tłumaczenie przykładu" value={examplePl} onChange={(e) => setExamplePl(e.target.value)} />
      {error && <p className="text-sm text-danger">{error}</p>}
      <Button
        className="w-full"
        disabled={busy || !lemma.trim() || !translation.trim()}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await api("/api/vocabulary", {
              method: "POST",
              json: { lemma, pos, translation, ...(exampleEs && examplePl ? { exampleEs, examplePl } : {}) },
            });
            onAdded();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Błąd");
          } finally {
            setBusy(false);
          }
        }}
      >
        Dodaj do nauki
      </Button>
    </Card>
  );
}
