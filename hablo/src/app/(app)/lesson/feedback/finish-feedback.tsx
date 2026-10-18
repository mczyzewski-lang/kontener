"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check } from "lucide-react";
import { api } from "@/lib/client/api";
import { Button } from "@/components/ui/button";

export function FinishFeedback({ itemId }: { itemId: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="lg"
      className="w-full"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        if (itemId) await api(`/api/plan/items/${itemId}`, { method: "PATCH", json: { status: "done" } }).catch(() => null);
        router.push("/");
        router.refresh();
      }}
    >
      <Check /> Zakończ dzień
    </Button>
  );
}
