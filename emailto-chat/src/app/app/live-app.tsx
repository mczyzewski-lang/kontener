"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import type { AccountInfo } from "@/core/types";
import { ChatApp } from "@/components/mail/chat-app";
import type { AccountActions } from "@/components/mail/settings-view";
import { createApiClient } from "@/lib/api-client";

async function post(url: string, method = "POST") {
  const res = await fetch(url, { method, credentials: "same-origin", headers: { "Content-Type": "application/json" } });
  if (!res.ok && res.status !== 204) throw new Error(`Request failed (${res.status})`);
}

export function LiveApp({ initialAccount, openSettings }: { initialAccount: AccountInfo; openSettings?: boolean }) {
  const router = useRouter();
  const [client] = React.useState(() => createApiClient());
  const actions = React.useMemo<AccountActions>(
    () => ({
      signOut: async () => {
        await post("/api/auth/logout").catch(() => {});
        router.replace("/");
        router.refresh();
      },
      disconnectGmail: async () => {
        await post("/api/account/disconnect");
        router.replace("/app/connect?disconnected=1");
      },
      deleteAccount: async () => {
        await post("/api/account", "DELETE");
        router.replace("/?deleted=1");
      },
    }),
    [router],
  );
  return <ChatApp client={client} initialAccount={initialAccount} accountActions={actions} initialSettingsOpen={openSettings} />;
}
