"use client";

import * as React from "react";
import type { Address, ConversationRef, Mailbox, MessageView, ReadFilter } from "@/core/types";
import { safeLocalStorage } from "@/lib/utils";

export type MobileView = "list" | "conversation" | "details";
export type MobileTab = "chats" | "search" | "settings";

export type ComposerIntent =
  | { kind: "reply"; message: MessageView; all: boolean; nonce: number }
  | { kind: "forward"; message: MessageView; nonce: number }
  | { kind: "newTopic"; nonce: number };

export interface NewMessageState {
  to: Address[];
}

interface AppState {
  mailbox: Mailbox;
  setMailbox: (m: Mailbox) => void;
  filter: ReadFilter;
  setFilter: (f: ReadFilter) => void;

  selected: ConversationRef | null;
  openConversation: (ref: ConversationRef, opts?: { threadId?: string; messageId?: string }) => void;
  closeConversation: () => void;

  activeThreadId: (ref: ConversationRef) => string | undefined;
  setActiveThread: (ref: ConversationRef, threadId: string, messageId?: string) => void;
  highlightMessageId: string | null;
  clearHighlight: () => void;

  closedTabs: (ref: ConversationRef) => string[];
  closeTab: (ref: ConversationRef, threadId: string) => void;
  reopenTab: (ref: ConversationRef, threadId: string) => void;

  composerIntent: ComposerIntent | null;
  setComposerIntent: (i: ComposerIntent | null) => void;

  newMessage: NewMessageState | null;
  startNewMessage: (to?: Address[]) => void;
  closeNewMessage: () => void;

  showDetails: boolean;
  setShowDetails: (v: boolean | ((v: boolean) => boolean)) => void;

  mobileView: MobileView;
  setMobileView: (v: MobileView) => void;
  mobileTab: MobileTab;
  setMobileTab: (t: MobileTab) => void;

  searchFocusNonce: number;
  focusSearch: () => void;
  shortcutsOpen: boolean;
  setShortcutsOpen: (v: boolean) => void;
  settingsOpen: boolean;
  setSettingsOpen: (v: boolean) => void;
}

const Ctx = React.createContext<AppState | null>(null);

export function useAppState(): AppState {
  const v = React.useContext(Ctx);
  if (!v) throw new Error("useAppState must be used inside <AppStateProvider>");
  return v;
}

export const refKey = (ref: ConversationRef) => `${ref.kind}:${ref.id}`;

const CLOSED_TABS_KEY = "etc:closed-tabs";

export function AppStateProvider({ children, storageNamespace, initialSettingsOpen = false }: { children: React.ReactNode; storageNamespace: string; initialSettingsOpen?: boolean }) {
  const [mailbox, setMailbox] = React.useState<Mailbox>("inbox");
  const [filter, setFilter] = React.useState<ReadFilter>("all");
  const [selected, setSelected] = React.useState<ConversationRef | null>(null);
  const [activeThreads, setActiveThreads] = React.useState<Record<string, string>>({});
  const [highlightMessageId, setHighlight] = React.useState<string | null>(null);
  const [closed, setClosed] = React.useState<Record<string, string[]>>({});
  const [composerIntent, setComposerIntent] = React.useState<ComposerIntent | null>(null);
  const [newMessage, setNewMessage] = React.useState<NewMessageState | null>(null);
  const [showDetails, setShowDetails] = React.useState(true);
  const [mobileView, setMobileViewState] = React.useState<MobileView>("list");
  const [mobileTab, setMobileTab] = React.useState<MobileTab>("chats");
  const [searchFocusNonce, setSearchFocusNonce] = React.useState(0);
  const [shortcutsOpen, setShortcutsOpen] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(initialSettingsOpen);

  const storageKey = `${CLOSED_TABS_KEY}:${storageNamespace}`;
  React.useEffect(() => {
    try {
      const raw = safeLocalStorage()?.getItem(storageKey);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate persisted UI state after mount
      if (raw) setClosed(JSON.parse(raw));
    } catch {
      /* ignore corrupted state */
    }
  }, [storageKey]);
  const persistClosed = React.useCallback(
    (next: Record<string, string[]>) => {
      setClosed(next);
      try {
        safeLocalStorage()?.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* quota */
      }
    },
    [storageKey],
  );

  // Mobile: integrate with the browser/Android back button.
  const setMobileView = React.useCallback((v: MobileView) => {
    setMobileViewState((prev) => {
      if (typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches) {
        const depth = (x: MobileView) => (x === "list" ? 0 : x === "conversation" ? 1 : 2);
        if (depth(v) > depth(prev)) window.history.pushState({ etcView: v }, "");
      }
      return v;
    });
  }, []);
  React.useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const v = (e.state?.etcView as MobileView | undefined) ?? "list";
      setMobileViewState((prev) => (prev === "details" && v !== "details" ? "conversation" : v === prev ? "list" : v));
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const openConversation = React.useCallback(
    (ref: ConversationRef, opts?: { threadId?: string; messageId?: string }) => {
      setSelected(ref);
      setNewMessage(null);
      setComposerIntent(null);
      if (opts?.threadId) {
        const threadId = opts.threadId;
        setActiveThreads((a) => ({ ...a, [refKey(ref)]: threadId }));
        setClosed((c) => {
          const k = refKey(ref);
          if (!c[k]?.includes(threadId)) return c;
          const next = { ...c, [k]: c[k].filter((t) => t !== threadId) };
          safeLocalStorage()?.setItem(storageKey, JSON.stringify(next));
          return next;
        });
      }
      setHighlight(opts?.messageId ?? null);
      setMobileView("conversation");
      setMobileTab("chats");
    },
    [setMobileView, storageKey],
  );

  const value = React.useMemo<AppState>(
    () => ({
      mailbox,
      setMailbox,
      filter,
      setFilter,
      selected,
      openConversation,
      closeConversation: () => {
        setSelected(null);
        setMobileViewState("list");
      },
      activeThreadId: (ref) => activeThreads[refKey(ref)],
      setActiveThread: (ref, threadId, messageId) => {
        setActiveThreads((a) => ({ ...a, [refKey(ref)]: threadId }));
        setHighlight(messageId ?? null);
        setComposerIntent(null);
        const k = refKey(ref);
        if (closed[k]?.includes(threadId)) persistClosed({ ...closed, [k]: closed[k].filter((t) => t !== threadId) });
      },
      highlightMessageId,
      clearHighlight: () => setHighlight(null),
      closedTabs: (ref) => closed[refKey(ref)] ?? [],
      closeTab: (ref, threadId) => {
        const k = refKey(ref);
        persistClosed({ ...closed, [k]: [...new Set([...(closed[k] ?? []), threadId])] });
      },
      reopenTab: (ref, threadId) => {
        const k = refKey(ref);
        persistClosed({ ...closed, [k]: (closed[k] ?? []).filter((t) => t !== threadId) });
      },
      composerIntent,
      setComposerIntent,
      newMessage,
      startNewMessage: (to = []) => {
        setNewMessage({ to });
        setMobileView("conversation");
        setMobileTab("chats");
      },
      closeNewMessage: () => {
        setNewMessage(null);
        if (!selected) setMobileViewState("list");
      },
      showDetails,
      setShowDetails,
      mobileView,
      setMobileView,
      mobileTab,
      setMobileTab,
      searchFocusNonce,
      focusSearch: () => setSearchFocusNonce((n) => n + 1),
      shortcutsOpen,
      setShortcutsOpen,
      settingsOpen,
      setSettingsOpen,
    }),
    [
      mailbox,
      filter,
      selected,
      openConversation,
      activeThreads,
      highlightMessageId,
      closed,
      persistClosed,
      composerIntent,
      newMessage,
      showDetails,
      mobileView,
      setMobileView,
      mobileTab,
      searchFocusNonce,
      shortcutsOpen,
      settingsOpen,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
