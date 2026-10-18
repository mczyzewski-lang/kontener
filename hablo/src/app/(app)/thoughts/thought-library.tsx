"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Pause, Pencil, Plus, Search, Sparkle, Star, Upload, Volume2 } from "lucide-react";
import type { ThoughtContext } from "@/lib/db/types";
import { api } from "@/lib/client/api";
import { useSpeech } from "@/lib/client/use-speech";
import { useCapabilities } from "@/components/capabilities";
import { THOUGHT_CONTEXTS, CONTEXT_LABEL } from "@/lib/thoughts/contexts";
import { Button } from "@/components/ui/button";
import { Card, Input, Notice, Textarea } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

interface Entry {
  id: string;
  kind: "thought" | "question";
  text: string;
  category_key: string | null;
  contexts: ThoughtContext[];
  featured: boolean;
  favorite: boolean;
  hidden: boolean;
  edited: boolean;
}
interface Category {
  key: string;
  name: string;
}
type Filter = "all" | "favorite" | "featured" | "hidden";

function norm(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l");
}

export function ThoughtLibrary({ categories, entries: initial }: { categories: Category[]; entries: Entry[] }) {
  const router = useRouter();
  const caps = useCapabilities();
  const { play, stop, playing } = useSpeech(caps.tts);
  const [entries, setEntries] = useState(initial);
  // Server data changes after an import (router.refresh) — take the new list.
  const [source, setSource] = useState(initial);
  if (source !== initial) {
    setSource(initial);
    setEntries(initial);
  }
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [cat, setCat] = useState<string>("");
  const [ctx, setCtx] = useState<ThoughtContext | "">("");
  const [showQuestions, setShowQuestions] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState<"thought" | "question" | null>(null);
  const catName = useMemo(() => new Map(categories.map((c) => [c.key, c.name])), [categories]);

  const visible = (kind: Entry["kind"]) =>
    entries.filter((e) => {
      if (e.kind !== kind) return false;
      if (filter === "hidden" ? !e.hidden : e.hidden) return false;
      if (filter === "favorite" && !e.favorite) return false;
      if (filter === "featured" && !e.featured) return false;
      if (cat && e.category_key !== cat) return false;
      if (ctx && !e.contexts.includes(ctx)) return false;
      if (q.trim() && !norm(`${e.text} ${catName.get(e.category_key ?? "") ?? ""}`).includes(norm(q.trim()))) return false;
      return true;
    });

  async function patch(id: string, p: Partial<Entry>) {
    setEntries((list) => list.map((e) => (e.id === id ? { ...e, ...p } : e)));
    await api(`/api/thoughts/${id}`, { method: "PATCH", json: p }).catch(() => router.refresh());
  }

  const thoughts = visible("thought");
  const questions = visible("question");
  const empty = entries.length === 0;

  const Item = (e: Entry) =>
    editing === e.id ? (
      <EntryEditor
        key={e.id}
        entry={e}
        categories={categories}
        onCancel={() => setEditing(null)}
        onSave={async (p) => {
          await patch(e.id, { ...p, edited: true });
          setEditing(null);
        }}
      />
    ) : (
      <li key={e.id} className={cn("group py-4", e.hidden && "opacity-60")}>
        <p className={cn("whitespace-pre-line leading-relaxed", e.kind === "thought" ? "font-serif text-[18px]" : "text-[16px]")}>
          {e.featured && <Sparkle className="mr-1.5 inline size-3.5 -translate-y-0.5 text-accent" aria-label="wyróżniona" />}
          {e.text}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          {e.category_key && <span>{catName.get(e.category_key) ?? e.category_key}</span>}
          {e.contexts.map((c) => (
            <span key={c} className="text-faint">
              {CONTEXT_LABEL[c]}
            </span>
          ))}
          {e.edited && <span className="text-faint">twoja wersja</span>}
          <span className="ml-auto flex items-center gap-1">
            <IconBtn label={playing === e.text ? "Zatrzymaj" : "Posłuchaj"} onClick={() => (playing === e.text ? stop() : play(e.text, { purpose: "thought" }))}>
              {playing === e.text ? <Pause /> : <Volume2 />}
            </IconBtn>
            <IconBtn label={e.favorite ? "Usuń z ulubionych" : "Ulubiona"} pressed={e.favorite} onClick={() => patch(e.id, { favorite: !e.favorite })}>
              <Star className={cn(e.favorite && "fill-accent text-accent")} />
            </IconBtn>
            <IconBtn label="Edytuj" onClick={() => setEditing(e.id)}>
              <Pencil />
            </IconBtn>
            <IconBtn label={e.hidden ? "Pokaż" : "Ukryj"} onClick={() => patch(e.id, { hidden: !e.hidden })}>
              {e.hidden ? <Eye /> : <EyeOff />}
            </IconBtn>
          </span>
        </div>
      </li>
    );

  return (
    <div className="space-y-5">
      {empty ? (
        <Notice>Biblioteka jest pusta. Zaimportuj swój plik z myślami poniżej albo dodaj pierwszą myśl.</Notice>
      ) : (
        <>
          <div className="relative">
            <Search className="absolute top-1/2 left-4 size-4 -translate-y-1/2 text-faint" />
            <Input className="pl-10" placeholder="Szukaj w myślach" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Szukaj" />
          </div>
          <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
            {(
              [
                ["all", "Wszystkie"],
                ["favorite", "Ulubione"],
                ["featured", "Wyróżnione"],
                ["hidden", "Ukryte"],
              ] as [Filter, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setFilter(id)}
                className={cn("shrink-0 rounded-full border px-3 py-1.5 text-sm", filter === id ? "border-ink bg-ink text-white" : "border-line bg-surface text-ink-2")}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select value={cat} onChange={(e) => setCat(e.target.value)} className="h-11 rounded-xl border border-line bg-surface px-3 text-sm" aria-label="Kategoria">
              <option value="">Wszystkie kategorie</option>
              {categories.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.name}
                </option>
              ))}
            </select>
            <select value={ctx} onChange={(e) => setCtx(e.target.value as ThoughtContext | "")} className="h-11 rounded-xl border border-line bg-surface px-3 text-sm" aria-label="Moment">
              <option value="">Każdy moment</option>
              {THOUGHT_CONTEXTS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <ul className="divide-y divide-line">{thoughts.map(Item)}</ul>
          {!thoughts.length && <p className="py-6 text-center text-sm text-muted">Nic tu nie pasuje do wybranych filtrów.</p>}
        </>
      )}

      <div className="flex gap-2">
        <Button variant="secondary" size="sm" onClick={() => setAdding(adding === "thought" ? null : "thought")}>
          <Plus /> Nowa myśl
        </Button>
        {showQuestions && (
          <Button variant="ghost" size="sm" onClick={() => setAdding(adding === "question" ? null : "question")}>
            <Plus /> Nowe pytanie
          </Button>
        )}
      </div>
      {adding && (
        <EntryEditor
          entry={{ id: "", kind: adding, text: "", category_key: cat || null, contexts: [], featured: false, favorite: false, hidden: false, edited: true }}
          categories={categories}
          onCancel={() => setAdding(null)}
          onSave={async (p) => {
            const r = await api<{ entry: Entry }>("/api/thoughts", { method: "POST", json: { kind: adding, ...p } });
            setEntries((l) => [...l, r.entry]);
            setAdding(null);
          }}
        />
      )}

      {entries.some((e) => e.kind === "question") && (
        <section className="pt-4">
          {!showQuestions ? (
            <button className="text-sm text-muted underline-offset-4 hover:underline" onClick={() => setShowQuestions(true)}>
              Pytania refleksyjne
            </button>
          ) : (
            <>
              <div className="flex items-baseline justify-between">
                <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">Pytania refleksyjne</h2>
                <button className="text-sm text-muted" onClick={() => setShowQuestions(false)}>
                  zwiń
                </button>
              </div>
              <ul className="divide-y divide-line">{questions.map(Item)}</ul>
            </>
          )}
        </section>
      )}

      <ImportBox onDone={() => router.refresh()} />
    </div>
  );
}

function IconBtn({ label, onClick, children, pressed }: { label: string; onClick: () => void; children: React.ReactNode; pressed?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      onClick={onClick}
      className="inline-flex size-9 items-center justify-center rounded-full text-muted hover:bg-sunken hover:text-ink [&_svg]:size-4"
    >
      {children}
    </button>
  );
}

function EntryEditor({
  entry,
  categories,
  onSave,
  onCancel,
}: {
  entry: Entry;
  categories: Category[];
  onSave: (p: { text: string; category_key: string | null; contexts: ThoughtContext[] }) => Promise<void>;
  onCancel: () => void;
}) {
  const [text, setText] = useState(entry.text);
  const [category, setCategory] = useState(entry.category_key ?? "");
  const [contexts, setContexts] = useState<ThoughtContext[]>(entry.contexts);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Card className="my-3 space-y-3 p-4">
      <Textarea value={text} onChange={(e) => setText(e.target.value)} autoFocus className="font-serif text-[17px]" aria-label="Treść" />
      <select value={category} onChange={(e) => setCategory(e.target.value)} className="h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm" aria-label="Kategoria">
        <option value="">Bez kategorii</option>
        {categories.map((c) => (
          <option key={c.key} value={c.key}>
            {c.name}
          </option>
        ))}
      </select>
      {entry.kind === "thought" && (
        <div className="flex flex-wrap gap-1.5" aria-label="Kiedy pokazywać">
          {THOUGHT_CONTEXTS.map((c) => {
            const on = contexts.includes(c.id);
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={on}
                onClick={() => setContexts(on ? contexts.filter((x) => x !== c.id) : [...contexts, c.id])}
                className={cn("rounded-full border px-3 py-1 text-xs", on ? "border-accent bg-accent-soft text-accent" : "border-line text-muted")}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={busy || !text.trim()}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await onSave({ text, category_key: category || null, contexts });
            } catch (e) {
              setError(e instanceof Error ? e.message : "Błąd zapisu");
            } finally {
              setBusy(false);
            }
          }}
        >
          Zapisz
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Anuluj
        </Button>
      </div>
    </Card>
  );
}

function ImportBox({ onDone }: { onDone: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <details className="rounded-2xl border border-line px-4 py-3 text-sm">
      <summary className="cursor-pointer text-muted">Import biblioteki (JSON)</summary>
      <div className="mt-3 space-y-3">
        <p className="text-muted">
          Plik zostaje tylko w twojej prywatnej bazie. Ponowny import aktualizuje wpisy, których nie zmieniałeś — twoje edycje, ulubione i ukryte zostają.
        </p>
        <input
          ref={input}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setBusy(true);
            setMsg(null);
            try {
              const r = await api<{
                categories: number;
                thoughts: { created: number; updated: number; keptEdited: number; unchanged: number };
                questions: { created: number; updated: number; keptEdited: number; unchanged: number };
                featured: number;
                warnings: string[];
              }>("/api/thoughts/import", { method: "POST", body: await f.text(), headers: { "Content-Type": "application/json" } });
              const t = r.thoughts;
              const qq = r.questions;
              setMsg({
                ok: true,
                text:
                  `Myśli: ${t.created} nowych, ${t.updated} zaktualizowanych, ${t.keptEdited} zachowanych w twojej wersji, ${t.unchanged} bez zmian. ` +
                  `Pytania: ${qq.created} nowych, ${qq.updated} zaktualizowanych, ${qq.keptEdited} zachowanych. Kategorie: ${r.categories}. Wyróżnione: ${r.featured}.` +
                  (r.warnings.length ? ` Uwagi: ${r.warnings.slice(0, 3).join(" ")}` : ""),
              });
              onDone();
            } catch (err) {
              setMsg({ ok: false, text: err instanceof Error ? err.message : "Błąd importu" });
            } finally {
              setBusy(false);
              if (input.current) input.current.value = "";
            }
          }}
        />
        <Button variant="secondary" size="sm" disabled={busy} onClick={() => input.current?.click()}>
          <Upload /> Wybierz plik
        </Button>
        {msg && <p className={msg.ok ? "text-success" : "text-danger"}>{msg.text}</p>}
      </div>
    </details>
  );
}
