"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client/api";
import { Button } from "@/components/ui/button";

export function SkipButton({ itemId }: { itemId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="ghost"
      className="w-full text-muted"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await api(`/api/plan/items/${itemId}`, { method: "PATCH", json: { status: "skipped" } }).catch(() => null);
        router.refresh();
        setBusy(false);
      }}
    >
      Pomiń to zadanie
    </Button>
  );
}
