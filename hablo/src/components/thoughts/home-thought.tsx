"use client";

import { useState } from "react";
import Link from "next/link";
import { Star, Volume2, Pause } from "lucide-react";
import { api } from "@/lib/client/api";
import { useSpeech } from "@/lib/client/use-speech";
import { useCapabilities } from "@/components/capabilities";
import { THOUGHT_CONTEXTS, CONTEXT_LABEL } from "@/lib/thoughts/contexts";
import type { ThoughtContext } from "@/lib/db/types";
import { cn } from "@/lib/utils";

type Thought = { id: string; text: string; favorite: boolean } | null;

/**
 * At most one personal thought, matched to the moment. No counters, no
 * prompts to act — just the thought, a way to hear it and a way to change the
 * moment. When nothing fits, nothing is shown.
 */
export function HomeThought({ initial, context }: { initial: Thought; context: ThoughtContext }) {
  const caps = useCapabilities();
  const { play, stop, playing } = useSpeech(caps.tts);
  const [thought, setThought] = useState<Thought>(initial);
  const [ctx, setCtx] = useState(context);
  const [choosing, setChoosing] = useState(false);

  async function choose(next: ThoughtContext) {
    setChoosing(false);
    setCtx(next);
    const r = await api<{ thought: Thought }>(`/api/thoughts/home?ctx=${next}`).catch(() => null);
    setThought(r?.thought ?? null);
  }

  return (
    <section aria-label="Myśl na teraz" className="animate-fade-in">
      {thought ? (
        <figure className="border-l-2 border-accent/60 pl-4">
          <blockquote className="font-serif text-[19px] leading-relaxed text-ink-2 whitespace-pre-line">{thought.text}</blockquote>
          <figcaption className="mt-2 flex items-center gap-3 text-xs text-muted">
            <button type="button" onClick={() => setChoosing((c) => !c)} className="underline-offset-2 hover:underline" aria-expanded={choosing}>
              {CONTEXT_LABEL[ctx]}
            </button>
            <button
              type="button"
              aria-label={playing ? "Zatrzymaj" : "Posłuchaj"}
              onClick={() => (playing ? stop() : play(thought.text, { purpose: "thought" }))}
              className="inline-flex items-center gap-1 hover:text-ink"
            >
              {playing ? <Pause className="size-3.5" /> : <Volume2 className="size-3.5" />} posłuchaj
            </button>
            <button
              type="button"
              aria-label={thought.favorite ? "Usuń z ulubionych" : "Dodaj do ulubionych"}
              aria-pressed={thought.favorite}
              onClick={async () => {
                const next = !thought.favorite;
                setThought({ ...thought, favorite: next });
                await api(`/api/thoughts/${thought.id}`, { method: "PATCH", json: { favorite: next } }).catch(() => null);
              }}
              className="hover:text-ink"
            >
              <Star className={cn("size-3.5", thought.favorite && "fill-accent text-accent")} />
            </button>
            <Link href="/thoughts" className="ml-auto hover:text-ink">
              Moje myśli
            </Link>
          </figcaption>
        </figure>
      ) : (
        <div className="flex items-center gap-3 text-xs text-muted">
          <button type="button" onClick={() => setChoosing((c) => !c)} aria-expanded={choosing} className="hover:text-ink">
            Myśl na teraz…
          </button>
          <Link href="/thoughts" className="ml-auto hover:text-ink">
            Moje myśli
          </Link>
        </div>
      )}
      {choosing && (
        <div className="mt-3 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Moment">
          {THOUGHT_CONTEXTS.map((c) => (
            <button
              key={c.id}
              role="radio"
              aria-checked={ctx === c.id}
              onClick={() => choose(c.id)}
              className={cn("rounded-full border px-3 py-1 text-xs", ctx === c.id ? "border-accent text-accent" : "border-line text-muted")}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
