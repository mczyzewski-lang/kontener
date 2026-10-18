"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Target } from "lucide-react";
import { api } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Card, Textarea } from "@/components/ui/primitives";

/** Personal Sprint: a short-term focus typed in plain Polish. */
export function SprintCard({ sprint }: { sprint: { goal: string; summary: string; endsOn: string } | null }) {
  const router = useRouter();
  const [goal, setGoal] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (sprint)
    return (
      <Card className="p-5">
        <div className="flex items-center gap-2 text-[13px] font-medium uppercase tracking-wide text-accent">
          <Target className="size-4" /> Sprint do {new Date(sprint.endsOn).toLocaleDateString("pl-PL", { day: "numeric", month: "long" })}
        </div>
        <p className="mt-1.5">{sprint.goal}</p>
        <p className="mt-1 text-sm text-muted">{sprint.summary}</p>
        <Button
          variant="ghost"
          size="sm"
          className="mt-2 -ml-3 text-muted"
          onClick={async () => {
            await api("/api/sprint", { method: "DELETE" });
            router.refresh();
          }}
        >
          Zakończ sprint
        </Button>
      </Card>
    );
  return (
    <Card className="p-5">
      <button className="flex w-full items-center gap-3 text-left" onClick={() => setOpen((o) => !o)}>
        <Target className="size-5 text-accent" />
        <div>
          <div className="font-medium">Sprint osobisty</div>
          <div className="text-sm text-muted">Np. „Za tydzień jadę do Hiszpanii. Restauracja, zakupy, sąsiedzi.”</div>
        </div>
      </button>
      {open && (
        <div className="mt-4 space-y-3">
          <Textarea value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Opisz, do czego chcesz się przygotować i kiedy…" />
          {error && <p className="text-sm text-danger">{error}</p>}
          <Button
            className="w-full"
            disabled={busy || goal.trim().length < 8}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await api("/api/sprint", { method: "POST", json: { goal } });
                router.refresh();
              } catch (e) {
                setError(e instanceof Error ? e.message : "Błąd");
              } finally {
                setBusy(false);
              }
            }}
          >
            Przygotuj sprint
          </Button>
          <p className="text-xs text-muted">Powtórki nadal mają pierwszeństwo — sprint dokłada scenariusze i zwroty.</p>
        </div>
      )}
    </Card>
  );
}
