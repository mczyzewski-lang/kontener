"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client/api";
import { cn } from "@/lib/utils";

const VARIANTS = [
  { id: "quick", label: "Quick · 10 min" },
  { id: "standard", label: "Standard · 30" },
  { id: "deep", label: "Deep · 45" },
] as const;

export function VariantPicker({ current }: { current: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="mt-3">
      <div role="radiogroup" aria-label="Długość lekcji" className="grid grid-cols-3 gap-1 rounded-full bg-sunken p-1">
        {VARIANTS.map((v) => (
          <button
            key={v.id}
            role="radio"
            aria-checked={current === v.id}
            disabled={busy}
            onClick={async () => {
              if (v.id === current) return;
              setBusy(true);
              setError(null);
              try {
                await api("/api/plan", { method: "POST", json: { variant: v.id } });
                router.refresh();
              } catch (e) {
                setError(e instanceof Error ? e.message : "Błąd");
              } finally {
                setBusy(false);
              }
            }}
            className={cn(
              "rounded-full py-2 text-[13px] transition-colors",
              current === v.id ? "bg-surface font-medium text-ink shadow-sm" : "text-muted",
            )}
          >
            {v.label}
          </button>
        ))}
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
