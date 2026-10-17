"use client";

import { AlertTriangle, MessageCircle, PenSquare, Search, Settings, WifiOff, X } from "lucide-react";
import * as React from "react";
import type { MailClient } from "@/core/client";
import type { AccountInfo } from "@/core/types";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { AppStateProvider, useAppState } from "./app-state";
import { ConversationView } from "./conversation-view";
import { DetailsPanel } from "./details-panel";
import { MailProvider, useMail } from "./mail-context";
import { SendQueueProvider, ToastProvider } from "./send-queue";
import { SettingsView, type AccountActions } from "./settings-view";
import { isTyping, SearchResults, Sidebar } from "./sidebar";

export interface ChatAppProps {
  client: MailClient;
  initialAccount?: AccountInfo;
  /** Landing-page embed: fixed height container, no global shortcuts, no history integration. */
  embedded?: boolean;
  accountActions?: AccountActions;
  onExit?: () => void;
  initialSettingsOpen?: boolean;
  className?: string;
}

export function ChatApp(props: ChatAppProps) {
  return (
    <MailProvider client={props.client} initialAccount={props.initialAccount} embedded={props.embedded}>
      <TooltipProvider>
        <ToastProvider>
          <SendQueueProvider>
            <AppStateProvider storageNamespace={props.client.mode} initialSettingsOpen={props.initialSettingsOpen}>
              <Shell {...props} />
            </AppStateProvider>
          </SendQueueProvider>
        </ToastProvider>
      </TooltipProvider>
    </MailProvider>
  );
}

function Shell({ embedded, accountActions, onExit, className }: ChatAppProps) {
  const app = useAppState();
  const { client } = useMail();
  useGlobalShortcuts(!embedded);

  const signOut = accountActions ? () => void accountActions.signOut() : onExit;
  const listScreen = app.mobileView === "list";

  return (
    <div className={cn("flex flex-col overflow-hidden bg-bg text-fg", embedded ? "h-full" : "h-dvh", className)}>
      <Banners />
      <div className="relative flex min-h-0 flex-1">
        {/* LEFT — People */}
        <div className={cn("min-h-0 w-full flex-col md:flex md:w-[300px] md:shrink-0 lg:w-[320px]", listScreen && app.mobileTab === "chats" ? "flex" : "hidden")}>
          <Sidebar onSignOut={signOut} className="flex-1" />
        </div>
        {listScreen && app.mobileTab === "search" && <MobileSearch />}
        {listScreen && app.mobileTab === "settings" && (
          <div className="flex min-h-0 w-full flex-col md:hidden">
            <header className="flex h-[60px] items-center px-4 pt-safe">
              <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-28">
              <SettingsView accountActions={accountActions} />
            </div>
          </div>
        )}

        {/* CENTER — Conversation */}
        <div className={cn("min-h-0 min-w-0 flex-1 flex-col md:flex", app.mobileView === "conversation" ? "flex" : "hidden")}>
          <ConversationView className="flex-1" />
        </div>

        {/* RIGHT — Details: column on xl, overlay drawer below xl, full screen on mobile */}
        {app.selected && !app.newMessage && app.showDetails && (
          <>
            <div className="hidden w-[300px] shrink-0 xl:flex 2xl:w-[320px]">
              <DetailsPanel className="w-full" />
            </div>
            <div
              className={cn("absolute inset-0 z-30 hidden bg-black/20 md:block xl:hidden", app.mobileView === "details" ? "md:block" : "md:hidden")}
              onClick={() => app.setMobileView("conversation")}
              aria-hidden
            />
            <div
              className={cn(
                "absolute inset-y-0 right-0 z-40 w-full flex-col shadow-lg md:w-[340px] xl:hidden",
                app.mobileView === "details" ? "flex animate-slide-up md:animate-fade-in" : "hidden",
              )}
            >
              <DetailsPanel className="w-full bg-bg md:bg-subtle" />
            </div>
          </>
        )}
      </div>

      {listScreen && <MobileTabBar />}

      <ShortcutsDialog />
      <Dialog open={app.settingsOpen} onOpenChange={app.setSettingsOpen}>
        <DialogContent title="Settings" description={client.mode === "demo" ? "Demo Mode — changes stay in this tab." : undefined} variant="sheet">
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 pt-4">
            <SettingsView accountActions={accountActions} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MobileSearch() {
  const [q, setQ] = React.useState("");
  const app = useAppState();
  return (
    <div className="flex min-h-0 w-full flex-col md:hidden">
      <header className="px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <h1 className="mb-2 text-xl font-semibold tracking-tight">Search</h1>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="People, topics, messages"
            className="h-10 w-full rounded-xl bg-muted pl-9 pr-9 text-[16px] outline-none placeholder:text-fg-subtle"
            enterKeyHint="search"
          />
          {q && (
            <button onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-fg-subtle" aria-label="Clear">
              <X className="size-4" />
            </button>
          )}
        </div>
      </header>
      {q.trim() ? (
        <SearchResults query={q} onPick={() => app.setMobileTab("chats")} />
      ) : (
        <p className="px-5 py-6 text-sm text-fg-muted">Search across people, topic subjects and the full text of your e-mail.</p>
      )}
    </div>
  );
}

function MobileTabBar() {
  const app = useAppState();
  const tabs = [
    { id: "chats" as const, label: "Chats", icon: MessageCircle },
    { id: "search" as const, label: "Search", icon: Search },
    { id: "compose" as const, label: "Compose", icon: PenSquare },
    { id: "settings" as const, label: "Settings", icon: Settings },
  ];
  return (
    <nav className="grid grid-cols-4 border-t border-border bg-bg/95 pb-safe backdrop-blur md:hidden" aria-label="Main">
      {tabs.map((t) => {
        const active = t.id !== "compose" && app.mobileTab === t.id;
        return (
          <button
            key={t.id}
            onClick={() => (t.id === "compose" ? app.startNewMessage() : app.setMobileTab(t.id))}
            className={cn("flex flex-col items-center gap-0.5 pb-1.5 pt-2 text-[11px] font-medium", active ? "text-accent" : "text-fg-muted")}
            aria-current={active ? "page" : undefined}
          >
            <t.icon className={cn("size-[22px]", active && "fill-accent/15")} />
            {t.label}
          </button>
        );
      })}
    </nav>
  );
}

function Banners() {
  const { client, online, account, syncStatus, embedded } = useMail();
  const [demoDismissed, setDemoDismissed] = React.useState(false);
  const needsReauth = account?.mailAccount?.status === "needs_reauth" || syncStatus?.state === "needs_reauth";
  return (
    <>
      {client.mode === "demo" && !demoDismissed && (
        <div className={cn("flex items-center justify-center gap-3 bg-warning-soft px-4 py-1.5 text-center text-xs text-fg", !embedded && "pt-[max(0.375rem,env(safe-area-inset-top))]")} role="status">
          <span>
            <strong className="font-semibold">Demo Mode</strong> — sample conversations; nothing is sent.
          </span>
          {!embedded && (
            <>
              <a href="/api/auth/google/login" className="font-semibold text-accent hover:underline">
                Connect Gmail →
              </a>
              <button onClick={() => setDemoDismissed(true)} className="text-fg-muted hover:text-fg" aria-label="Dismiss">
                <X className="size-3.5" />
              </button>
            </>
          )}
        </div>
      )}
      {!online && (
        <div className="flex items-center justify-center gap-2 bg-fg px-4 py-1.5 text-xs text-bg" role="alert">
          <WifiOff className="size-3.5" /> You’re offline. Showing what’s already loaded — we’ll sync when you’re back.
        </div>
      )}
      {needsReauth && client.mode === "live" && (
        <div className="flex items-center justify-center gap-2 bg-danger-soft px-4 py-1.5 text-xs text-fg" role="alert">
          <AlertTriangle className="size-3.5 text-danger" /> Gmail access expired or was revoked.
          <a href="/api/auth/google/connect" className="font-semibold text-accent hover:underline">
            Reconnect Gmail
          </a>
        </div>
      )}
    </>
  );
}

function useGlobalShortcuts(enabled: boolean) {
  const app = useAppState();
  React.useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape") {
        if (isTyping(e.target)) (e.target as HTMLElement).blur();
        else if (app.newMessage) app.closeNewMessage();
        else if (app.composerIntent) app.setComposerIntent(null);
        return;
      }
      if (isTyping(e.target)) return;
      if (e.key === "/") {
        e.preventDefault();
        app.focusSearch();
      } else if (e.key === "c") {
        e.preventDefault();
        app.startNewMessage();
      } else if (e.key === "?") {
        app.setShortcutsOpen(true);
      } else if (e.key === "i") {
        app.setShowDetails((v) => !v);
      } else if (e.key === "g") {
        app.setMailbox("inbox");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, app]);
}

const SHORTCUTS: [string, string][] = [
  ["J / K", "Next / previous conversation"],
  ["[ / ]", "Previous / next topic tab"],
  ["R", "Reply in current topic"],
  ["N", "New topic with this person"],
  ["C", "New message"],
  ["E", "Archive / unarchive topic"],
  ["U", "Mark topic unread"],
  ["S", "Star / unstar topic"],
  ["I", "Toggle details panel"],
  ["/", "Search"],
  ["Enter", "Send (Shift + Enter for a new line)"],
  ["Esc", "Close / cancel"],
  ["?", "Show shortcuts"],
];

function ShortcutsDialog() {
  const app = useAppState();
  return (
    <Dialog open={app.shortcutsOpen} onOpenChange={app.setShortcutsOpen}>
      <DialogContent title="Keyboard shortcuts">
        <ul className="divide-y divide-border px-5 pb-5 pt-3">
          {SHORTCUTS.map(([k, d]) => (
            <li key={k} className="flex items-center justify-between py-2 text-sm">
              <span className="text-fg-muted">{d}</span>
              <kbd className="rounded-md border border-border bg-subtle px-2 py-0.5 font-mono text-xs">{k}</kbd>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
