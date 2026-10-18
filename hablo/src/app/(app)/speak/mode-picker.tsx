"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MODES = [
  { id: "guided", label: "Prowadzona", hint: "wolniej, z podpowiedziami" },
  { id: "natural", label: "Naturalna", hint: "płynnie, mniej poprawek" },
  { id: "real_life", label: "Z życia", hint: "jak z Hiszpanem, bez pomocy" },
] as const;

export function ModePicker({ voice, text }: { voice: boolean; text: boolean }) {
  const [mode, setMode] = useState<(typeof MODES)[number]["id"]>("guided");
  return (
    <div className="mt-5 space-y-3">
      <div role="radiogroup" aria-label="Tryb rozmowy" className="grid grid-cols-3 gap-1.5">
        {MODES.map((m) => (
          <button
            key={m.id}
            role="radio"
            aria-checked={mode === m.id}
            onClick={() => setMode(m.id)}
            className={cn("rounded-xl border px-2 py-2.5 text-left", mode === m.id ? "border-accent bg-accent-soft" : "border-line")}
          >
            <div className={cn("text-sm font-medium", mode === m.id && "text-accent")}>{m.label}</div>
            <div className="text-[11px] leading-tight text-muted">{m.hint}</div>
          </button>
        ))}
      </div>
      {voice ? (
        <Button asChild size="lg" className="w-full">
          <Link href={`/speak/session?mode=${mode}`}>Zacznij rozmowę</Link>
        </Button>
      ) : text ? (
        <Button asChild size="lg" variant="secondary" className="w-full">
          <Link href={`/speak/session?mode=${mode}&channel=text`}>Rozmawiaj tekstem</Link>
        </Button>
      ) : null}
    </div>
  );
}
