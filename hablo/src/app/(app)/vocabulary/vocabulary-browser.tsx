"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Search, Zap, Loader2 } from "lucide-react";
import { api } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Card, Input, Progress } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { AddWord } from "./add-word";

type Comp = "none" | "learning" | "solid";
interface Row {
  id: string;
  kind: "word" | "phrase";
  display: string;
  lemma: string;
  pl: string;
  rank: number | null;
  level: number;
  topics: string[];
  own: boolean;
  listening: Comp;
  recall: Comp;
  speaking: Comp;
  claimed: boolean;
  due: boolean;
  seen: boolean;
}

const FILTERS = [
  { id: "all", label: "Wszystkie" },
  { id: "new", label: "Nowe" },
  { id: "learning", label: "W nauce" },
  { id: "due", label: "Do powtórki" },
  { id: "mastered", label: "Opanowane" },
  { id: "phrases", label: "Zwroty" },
  { id: "own", label: "Moje" },
] as const;

function dot(c: Comp) {
  return c === "solid" ? "bg-success" : c === "learning" ? "bg-warn" : "bg-line-strong";
}

export function VocabularyBrowser() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [q, setQ] = useState("");
  const [band, setBand] = useState(0);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const [adding, setAdding] = useState(false);

  const load = () => api<{ items: Row[] }>("/api/vocabulary").then((r) => setRows(r.items));
  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const needle = q.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    return rows.filter((r) => {
      if (band && r.level !== band) return false;
      if (needle) {
        const hay = `${r.lemma} ${r.pl}`.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
        if (!hay.includes(needle)) return false;
      }
      switch (filter) {
        case "new":
          return !r.seen;
        case "learning":
          return r.seen && !(r.listening === "solid" && r.recall === "solid");
        case "due":
          return r.due;
        case "mastered":
          return r.listening === "solid" && r.recall === "solid" && r.speaking !== "none";
        case "phrases":
          return r.kind === "phrase";
        case "own":
          return r.own;
        default:
          return true;
      }
    });
  }, [rows, q, band, filter]);

  const bands = [1, 2, 3, 4, 5].map((l) => {
    const inBand = rows?.filter((r) => r.kind === "word" && r.level === l) ?? [];
    const mastered = inBand.filter((r) => r.listening === "solid" && r.recall === "solid" && r.speaking !== "none").length;
    return { level: l, mastered, available: inBand.length };
  });

  if (!rows)
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="size-6 animate-spin text-muted" />
      </div>
    );

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2">
        <Button asChild>
          <Link href="/learn/review?mode=practice">
            <Zap /> Fiszki
          </Link>
        </Button>
        <Button variant="secondary" onClick={() => setAdding((a) => !a)}>
          <Plus /> Dodaj słowo
        </Button>
      </div>
      {adding && (
        <AddWord
          onAdded={() => {
            setAdding(false);
            void load();
          }}
        />
      )}

      <div className="grid grid-cols-5 gap-1.5">
        {bands.map((b) => (
          <button
            key={b.level}
            onClick={() => setBand(band === b.level ? 0 : b.level)}
            className={cn("rounded-xl border p-2 text-left", band === b.level ? "border-accent bg-accent-soft" : "border-line bg-surface")}
          >
            <div className="text-[11px] text-muted">{(b.level - 1) * 1000 + 1}–{b.level * 1000}</div>
            <div className="text-sm font-semibold tabular-nums">{b.mastered}</div>
            <Progress value={(b.mastered / 1000) * 100} className="mt-1 h-1" />
          </button>
        ))}
      </div>
      <p className="-mt-2 text-xs text-faint">
        Opanowane w każdym tysiącu. W bibliotece jest teraz {rows.filter((r) => r.kind === "word").length} słów — kolejne partie dochodzą do pełnych 5000.
      </p>

      <div className="relative">
        <Search className="absolute top-1/2 left-4 size-4 -translate-y-1/2 text-faint" />
        <Input className="pl-10" placeholder="Szukaj po hiszpańsku lub po polsku" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Szukaj" />
      </div>
      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={cn("shrink-0 rounded-full border px-3 py-1.5 text-sm", filter === f.id ? "border-ink bg-ink text-white" : "border-line bg-surface text-ink-2")}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-4 text-xs text-muted">
        <span>Kropki:</span>
        <span>słuch · przypominanie · mówienie</span>
        <span className="inline-flex items-center gap-1"><i className="size-2 rounded-full bg-warn" /> w nauce</span>
        <span className="inline-flex items-center gap-1"><i className="size-2 rounded-full bg-success" /> utrwalone</span>
      </div>

      <Card className="divide-y divide-line">
        {filtered.slice(0, 300).map((r) => (
          <Link key={r.id} href={`/vocabulary/${r.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-sunken/60">
            <span className="w-10 shrink-0 text-right text-xs tabular-nums text-faint">{r.rank ?? "—"}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-serif text-[17px]" lang="es">
                {r.display}
              </span>
              <span className="block truncate text-sm text-muted">{r.pl}</span>
            </span>
            {r.claimed && <span className="text-[11px] text-faint">do weryfikacji</span>}
            <span className="flex gap-1" aria-label={`słuch: ${r.listening}, przypominanie: ${r.recall}, mówienie: ${r.speaking}`}>
              <i className={cn("size-2 rounded-full", dot(r.listening))} />
              <i className={cn("size-2 rounded-full", dot(r.recall))} />
              <i className={cn("size-2 rounded-full", dot(r.speaking))} />
            </span>
          </Link>
        ))}
        {!filtered.length && <div className="px-4 py-8 text-center text-sm text-muted">Brak wyników.</div>}
      </Card>
      {filtered.length > 300 && <p className="text-center text-xs text-muted">Pokazano 300 z {filtered.length} — zawęź wyszukiwanie.</p>}
    </div>
  );
}
