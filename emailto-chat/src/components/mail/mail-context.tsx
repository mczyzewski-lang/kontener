"use client";

import * as React from "react";
import useSWR, { SWRConfig, useSWRConfig } from "swr";
import type { AttachmentScope, MailClient } from "@/core/client";
import { MailClientError } from "@/core/client";
import { makeSelf, type SelfIdentity } from "@/core/grouping";
import {
  DEFAULT_PREFERENCES,
  type AccountInfo,
  type ConversationRef,
  type Mailbox,
  type ReadFilter,
  type SyncStatus,
  type UserPreferences,
} from "@/core/types";
import { safeLocalStorage } from "@/lib/utils";

interface MailContextValue {
  client: MailClient;
  account: AccountInfo | undefined;
  prefs: UserPreferences;
  updatePrefs: (patch: Partial<UserPreferences>) => Promise<void>;
  self: SelfIdentity;
  online: boolean;
  syncStatus: SyncStatus | null;
  syncNow: () => Promise<void>;
  /** Revalidate every cached query (after sync or a mutation that affects many views). */
  refreshAll: () => Promise<void>;
  embedded: boolean;
}

const MailContext = React.createContext<MailContextValue | null>(null);

export function useMail(): MailContextValue {
  const ctx = React.useContext(MailContext);
  if (!ctx) throw new Error("useMail must be used inside <MailProvider>");
  return ctx;
}

export function MailProvider({
  client,
  initialAccount,
  embedded = false,
  children,
}: {
  client: MailClient;
  initialAccount?: AccountInfo;
  embedded?: boolean;
  children: React.ReactNode;
}) {
  // Each client gets its own cache: demo data never leaks into the live app and vice versa.
  const [cache] = React.useState(() => new Map<string, unknown>());
  return (
    <SWRConfig
      value={{
        provider: () => cache as never,
        revalidateOnFocus: client.mode === "live",
        shouldRetryOnError: (err: unknown) => !(err instanceof MailClientError && ["unauthorized", "needs_reauth", "not_found", "invalid"].includes(err.code)),
        errorRetryCount: 3,
        keepPreviousData: true,
      }}
    >
      <MailProviderInner client={client} initialAccount={initialAccount} embedded={embedded}>
        {children}
      </MailProviderInner>
    </SWRConfig>
  );
}

function MailProviderInner({
  client,
  initialAccount,
  embedded,
  children,
}: {
  client: MailClient;
  initialAccount?: AccountInfo;
  embedded: boolean;
  children: React.ReactNode;
}) {
  const { mutate } = useSWRConfig();
  const { data: account, mutate: mutateAccount } = useSWR(["me"], () => client.me(), { fallbackData: initialAccount });
  const online = useOnline();
  const [syncStatus, setSyncStatus] = React.useState<SyncStatus | null>(null);

  const prefs = account?.preferences ?? DEFAULT_PREFERENCES;
  const self = React.useMemo(
    () => makeSelf(account?.mailAccount?.email ?? account?.user.email ?? "", account?.mailAccount?.aliases ?? []),
    [account],
  );

  const refreshAll = React.useCallback(async () => {
    // Single-argument mutate = revalidate while keeping the cached data on screen.
    await mutate((key) => Array.isArray(key) && key[0] !== "me");
  }, [mutate]);

  const updatePrefs = React.useCallback(
    async (patch: Partial<UserPreferences>) => {
      if (patch.theme) applyTheme(patch.theme);
      await mutateAccount(
        async (cur) => {
          const next = await client.updatePreferences(patch);
          return cur ? { ...cur, preferences: next } : cur;
        },
        { optimisticData: (cur) => (cur ? { ...cur, preferences: { ...cur.preferences, ...patch } } : (cur as never)), rollbackOnError: true },
      );
    },
    [client, mutateAccount],
  );

  // Background sync: on open, on reconnect, then every pollIntervalSec while the tab is visible.
  const syncing = React.useRef(false);
  const syncNow = React.useCallback(async () => {
    if (syncing.current || !navigator.onLine) return;
    syncing.current = true;
    try {
      const status = await client.sync();
      setSyncStatus(status);
      await refreshAll();
    } catch (err) {
      if (err instanceof MailClientError && err.code === "needs_reauth") {
        setSyncStatus((s) => ({ ...(s ?? emptyStatus()), state: "needs_reauth" }));
        await mutateAccount();
      } else if (!(err instanceof MailClientError && err.code === "conflict")) {
        setSyncStatus((s) => ({ ...(s ?? emptyStatus()), state: "error", error: err instanceof Error ? err.message : "Sync failed" }));
      }
    } finally {
      syncing.current = false;
    }
  }, [client, refreshAll, mutateAccount]);

  React.useEffect(() => {
    if (embedded && client.mode === "demo") {
      // Embedded demo on the landing page: poll lightly so simulated replies show up.
      const id = window.setInterval(() => void syncNow(), 4000);
      return () => window.clearInterval(id);
    }
    void syncNow();
    const intervalMs = Math.max(10, client.mode === "demo" ? 4 : prefs.pollIntervalSec) * 1000;
    let timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void syncNow();
    }, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        window.clearInterval(timer);
        void syncNow();
        timer = window.setInterval(() => document.visibilityState === "visible" && void syncNow(), intervalMs);
      }
    };
    const onOnline = () => void syncNow();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [client, syncNow, prefs.pollIntervalSec, embedded]);

  // While the initial import is still running, sync more often so people appear progressively.
  React.useEffect(() => {
    if (client.mode !== "live" || !syncStatus || syncStatus.backfillComplete || syncStatus.state !== "idle") return;
    const id = window.setTimeout(() => void syncNow(), syncStatus.initialSyncComplete ? 4000 : 1500);
    return () => window.clearTimeout(id);
  }, [client.mode, syncStatus, syncNow]);

  React.useEffect(() => {
    if (!embedded && account?.preferences.theme) applyTheme(account.preferences.theme);
  }, [account?.preferences.theme, embedded]);

  const value = React.useMemo<MailContextValue>(
    () => ({ client, account, prefs, updatePrefs, self, online, syncStatus, syncNow, refreshAll, embedded }),
    [client, account, prefs, updatePrefs, self, online, syncStatus, syncNow, refreshAll, embedded],
  );
  return <MailContext.Provider value={value}>{children}</MailContext.Provider>;
}

function emptyStatus(): SyncStatus {
  return { state: "idle", lastSyncAt: null, initialSyncComplete: false, backfillComplete: false, threadCount: 0 };
}

export function applyTheme(theme: UserPreferences["theme"]) {
  safeLocalStorage()?.setItem("etc:theme", theme);
  const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

export function useOnline(): boolean {
  return React.useSyncExternalStore(
    (cb) => {
      window.addEventListener("online", cb);
      window.addEventListener("offline", cb);
      return () => {
        window.removeEventListener("online", cb);
        window.removeEventListener("offline", cb);
      };
    },
    () => navigator.onLine,
    () => true,
  );
}

// ── Query hooks ────────────────────────────────────────────────────────────────

export function useConversations(mailbox: Mailbox, filter: ReadFilter) {
  const { client } = useMail();
  return useSWR(["conversations", mailbox, filter], () => client.listConversations({ mailbox, filter }));
}

export function useConversation(ref: ConversationRef | null) {
  const { client } = useMail();
  return useSWR(ref ? ["conversation", ref.kind, ref.id] : null, () => client.getConversation(ref!));
}

export function useThread(threadId: string | null) {
  const { client } = useMail();
  return useSWR(threadId ? ["thread", threadId] : null, () => client.getThread(threadId!), { revalidateOnFocus: false });
}

export function useAttachments(scope: AttachmentScope | null) {
  const { client } = useMail();
  const key = scope ? ["attachments", scope.kind, scope.kind === "thread" ? scope.threadId : scope.id] : null;
  return useSWR(key, () => client.listAttachments(scope!));
}

export function useSearch(query: string) {
  const { client } = useMail();
  const q = useDebounced(query.trim(), 250);
  return { ...useSWR(q.length >= 2 ? ["search", q] : null, () => client.search(q), { keepPreviousData: false }), debouncedQuery: q };
}

export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const id = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return v;
}
