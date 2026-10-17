"use client";

import {
  Archive,
  ChevronDown,
  ChevronRight,
  Inbox,
  Keyboard,
  Layers,
  LogOut,
  Monitor,
  Moon,
  PenSquare,
  Search,
  Send,
  Settings,
  Sun,
  Users,
  X,
} from "lucide-react";
import * as React from "react";
import { displayName } from "@/core/addresses";
import { cleanSubject } from "@/core/grouping";
import type { ConversationSummary, GroupSummary, Mailbox, PersonSummary } from "@/core/types";
import { Avatar, GroupAvatar } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { IconButton } from "@/components/ui/icon-button";
import { Skeleton } from "@/components/ui/skeleton";
import { Logo } from "@/components/brand/logo";
import { cn, formatListTime } from "@/lib/utils";
import { useAppState } from "./app-state";
import { useConversations, useMail, useSearch } from "./mail-context";

const MAILBOXES: { id: Mailbox; label: string; icon: React.ElementType }[] = [
  { id: "inbox", label: "Inbox", icon: Inbox },
  { id: "sent", label: "Sent", icon: Send },
  { id: "archive", label: "Archive", icon: Archive },
  { id: "all", label: "All Mail", icon: Layers },
];

export function Sidebar({ onSignOut, className }: { onSignOut?: () => void; className?: string }) {
  const app = useAppState();
  const { account, client, prefs, updatePrefs } = useMail();
  const [query, setQuery] = React.useState("");
  const searchRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (app.searchFocusNonce) searchRef.current?.focus();
  }, [app.searchFocusNonce]);

  const mb = MAILBOXES.find((m) => m.id === app.mailbox)!;

  return (
    <aside className={cn("flex h-full min-h-0 flex-col bg-subtle md:border-r", className)} aria-label="Conversations">
      <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-3">
        <Logo className="h-6" />
        <div className="flex items-center gap-0.5">
          <IconButton label="New message" shortcut="C" onClick={() => app.startNewMessage()}>
            <PenSquare />
          </IconButton>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="ml-1 rounded-full outline-offset-2 transition-opacity hover:opacity-85"
                aria-label="Account menu"
              >
                <Avatar email={account?.user.email ?? "me"} name={account?.user.name} size="sm" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-64">
              <div className="px-2.5 py-2">
                <div className="truncate text-sm font-medium">{account?.user.name ?? "…"}</div>
                <div className="truncate text-xs text-fg-muted">{account?.mailAccount?.email ?? account?.user.email}</div>
                {client.mode === "demo" && (
                  <div className="mt-1.5 inline-flex rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-medium text-warning">Demo Mode</div>
                )}
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem icon={<Settings />} onSelect={() => app.setSettingsOpen(true)}>
                Settings
              </DropdownMenuItem>
              <DropdownMenuItem icon={<Keyboard />} shortcut="?" onSelect={() => app.setShortcutsOpen(true)}>
                Keyboard shortcuts
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Theme</DropdownMenuLabel>
              {(
                [
                  ["system", "System", Monitor],
                  ["light", "Light", Sun],
                  ["dark", "Dark", Moon],
                ] as const
              ).map(([id, label, Icon]) => (
                <DropdownMenuItem key={id} icon={<Icon />} onSelect={() => void updatePrefs({ theme: id })} className={cn(prefs.theme === id && "font-medium text-accent")}>
                  {label}
                </DropdownMenuItem>
              ))}
              {onSignOut && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem icon={<LogOut />} onSelect={onSignOut}>
                    {client.mode === "demo" ? "Exit demo" : "Sign out"}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="px-3 pb-2">
        <label className="relative block">
          <span className="sr-only">Search people, topics and messages</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setQuery("");
                e.currentTarget.blur();
              }
            }}
            placeholder="Search people, topics, messages"
            className="h-9 w-full rounded-lg border border-transparent bg-muted pl-9 pr-8 text-sm placeholder:text-fg-subtle focus:border-accent focus:bg-panel focus:outline-none"
          />
          {query ? (
            <button onClick={() => setQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-fg-subtle hover:text-fg" aria-label="Clear search">
              <X className="size-4" />
            </button>
          ) : (
            <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-border px-1.5 font-mono text-[10px] text-fg-subtle md:block">/</kbd>
          )}
        </label>
      </div>

      {query.trim() ? (
        <SearchResults query={query} onPick={() => setQuery("")} />
      ) : (
        <>
          <div className="flex items-center justify-between gap-2 px-3 pb-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[13px] font-semibold text-fg hover:bg-hover">
                  <mb.icon className="size-4 text-fg-muted" />
                  {mb.label}
                  <ChevronDown className="size-3.5 text-fg-subtle" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-44">
                {MAILBOXES.map((m) => (
                  <DropdownMenuItem key={m.id} icon={<m.icon />} onSelect={() => app.setMailbox(m.id)} className={cn(app.mailbox === m.id && "font-medium text-accent")}>
                    {m.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <div role="radiogroup" aria-label="Filter" className="flex rounded-lg bg-muted p-0.5 text-xs">
              {(["all", "unread"] as const).map((f) => (
                <button
                  key={f}
                  role="radio"
                  aria-checked={app.filter === f}
                  onClick={() => app.setFilter(f)}
                  className={cn(
                    "rounded-md px-2.5 py-1 font-medium capitalize transition-colors",
                    app.filter === f ? "bg-panel text-fg shadow-sm" : "text-fg-muted hover:text-fg",
                  )}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
          <ConversationLists />
        </>
      )}
    </aside>
  );
}

function ConversationLists() {
  const app = useAppState();
  const { syncStatus, client } = useMail();
  const { data, error, isLoading, mutate } = useConversations(app.mailbox, app.filter);
  const [groupsExpanded, setGroupsExpanded] = React.useState(false);
  const [groupsCollapsed, setGroupsCollapsed] = React.useState(false);
  const listRef = React.useRef<HTMLDivElement>(null);

  // j / k keyboard navigation over the visible list.
  const flat = React.useMemo<ConversationSummary[]>(() => (data ? [...data.groups, ...data.people] : []), [data]);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      if (e.key !== "j" && e.key !== "k") return;
      if (!flat.length) return;
      const idx = app.selected ? flat.findIndex((c) => c.kind === app.selected!.kind && c.id === app.selected!.id) : -1;
      const next = e.key === "j" ? Math.min(flat.length - 1, idx + 1) : Math.max(0, idx - 1);
      const c = flat[next];
      app.openConversation({ kind: c.kind, id: c.id });
      listRef.current?.querySelector(`[data-conv="${c.kind}:${c.id}"]`)?.scrollIntoView({ block: "nearest" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flat, app]);

  if (error && !data) {
    return (
      <div className="m-3 rounded-xl border border-border bg-panel p-4 text-sm">
        <p className="font-medium">Couldn’t load conversations</p>
        <p className="mt-1 text-fg-muted">{error instanceof Error ? error.message : "Unknown error"}</p>
        <button onClick={() => void mutate()} className="mt-3 text-sm font-medium text-accent hover:underline">
          Try again
        </button>
      </div>
    );
  }
  if (isLoading && !data) return <ListSkeleton />;

  const groups = data?.groups ?? [];
  const people = data?.people ?? [];
  const shownGroups = groupsExpanded ? groups : groups.slice(0, 3);
  const importing = client.mode === "live" && syncStatus && !syncStatus.initialSyncComplete;

  if (!groups.length && !people.length) {
    return importing ? (
      <div className="px-4 py-2">
        <p className="px-1 pb-3 text-xs text-fg-muted">Importing your recent conversations from Gmail…</p>
        <ListSkeleton />
      </div>
    ) : (
      <EmptyList unread={app.filter === "unread"} mailbox={app.mailbox} />
    );
  }

  return (
    <div ref={listRef} className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-2 pb-24 md:pb-3">
      {groups.length > 0 && (
        <section aria-label="Group conversations" className="mb-1">
          <SectionHeader label="Group conversations" count={groups.length} collapsed={groupsCollapsed} onToggle={() => setGroupsCollapsed((v) => !v)} />
          {!groupsCollapsed && (
            <>
              {shownGroups.map((g) => (
                <ConversationItem key={g.id} conv={g} />
              ))}
              {groups.length > 3 && (
                <button onClick={() => setGroupsExpanded((v) => !v)} className="ml-3 py-1 text-xs font-medium text-accent hover:underline">
                  {groupsExpanded ? "Show fewer" : `Show all ${groups.length} groups`}
                </button>
              )}
            </>
          )}
        </section>
      )}
      <section aria-label="People">
        <SectionHeader label="People" count={people.length} />
        {people.map((p) => (
          <ConversationItem key={p.id} conv={p} />
        ))}
        {importing && <p className="px-3 py-3 text-xs text-fg-subtle">Still importing older conversations…</p>}
      </section>
    </div>
  );
}

function SectionHeader({ label, count, collapsed, onToggle }: { label: string; count: number; collapsed?: boolean; onToggle?: () => void }) {
  const content = (
    <>
      {onToggle && (collapsed ? <ChevronRight className="size-3" /> : <ChevronDown className="size-3" />)}
      {label}
      <span className="font-normal text-fg-subtle">{count}</span>
    </>
  );
  return onToggle ? (
    <button onClick={onToggle} className="flex w-full items-center gap-1 px-2 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle hover:text-fg-muted" aria-expanded={!collapsed}>
      {content}
    </button>
  ) : (
    <h3 className="flex items-center gap-1 px-2 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">{content}</h3>
  );
}

export function ConversationItem({ conv, onPick }: { conv: ConversationSummary; onPick?: () => void }) {
  const app = useAppState();
  const active = app.selected?.kind === conv.kind && app.selected.id === conv.id;
  const unread = conv.unreadCount > 0;
  const name = conv.kind === "person" ? (conv.isSelf ? "Notes to self" : displayName(conv)) : conv.title;
  const prefix = conv.lastFromMe ? "You: " : conv.kind === "group" && conv.lastSenderName ? `${conv.lastSenderName}: ` : "";
  const title = conv.kind === "person" ? conv.email : conv.members.map((m) => m.email).join(", ");

  return (
    <button
      data-conv={`${conv.kind}:${conv.id}`}
      onClick={() => {
        app.openConversation({ kind: conv.kind, id: conv.id });
        onPick?.();
      }}
      title={title}
      aria-current={active ? "true" : undefined}
      className={cn(
        "group relative flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors",
        active ? "bg-active" : "hover:bg-hover",
      )}
    >
      {conv.kind === "person" ? <Avatar email={conv.email} name={conv.name} size="lg" /> : <GroupAvatar members={conv.members} size="lg" />}
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className={cn("truncate text-[14px]", unread ? "font-semibold text-fg" : "font-medium text-fg")}>
            {name}
            {conv.kind === "group" && <Users className="ml-1 inline size-3 align-[-1px] text-fg-subtle" aria-label="Group" />}
          </span>
          <span className={cn("shrink-0 text-[11px] tabular-nums", unread ? "font-semibold text-accent" : "text-fg-subtle")}>{formatListTime(conv.lastActivityAt)}</span>
        </span>
        <span className="mt-0.5 flex items-center justify-between gap-2">
          <span className={cn("truncate text-[13px]", unread ? "text-fg" : "text-fg-muted")}>
            <span className="group-hover:hidden">
              {prefix}
              {conv.lastSnippet || " "}
            </span>
            <span className="hidden text-fg-subtle group-hover:inline">{conv.kind === "person" ? conv.email : `${conv.members.length + 1} people · ${conv.threadCount} topic${conv.threadCount === 1 ? "" : "s"}`}</span>
          </span>
          {unread && (
            <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-semibold text-accent-fg" aria-label={`${conv.unreadCount} unread`}>
              {conv.unreadCount > 99 ? "99+" : conv.unreadCount}
            </span>
          )}
        </span>
      </span>
      {active && <span className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-accent" aria-hidden />}
    </button>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-1 px-2 py-2" aria-busy="true" aria-label="Loading conversations">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-2.5 py-2.5">
          <Skeleton className="size-12 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="h-3 w-4/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyList({ unread, mailbox }: { unread: boolean; mailbox: Mailbox }) {
  const app = useAppState();
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-8 pb-16 text-center">
      <div className="mb-3 grid size-12 place-items-center rounded-2xl bg-muted text-fg-muted">
        <Inbox className="size-5" />
      </div>
      <p className="text-sm font-medium">{unread ? "You’re all caught up" : mailbox === "inbox" ? "Your inbox is clear" : "Nothing here yet"}</p>
      <p className="mt-1 text-[13px] text-fg-muted">
        {unread ? "No unread conversations." : "Start a conversation — it will arrive as a normal e-mail."}
      </p>
      {unread ? (
        <button onClick={() => app.setFilter("all")} className="mt-3 text-sm font-medium text-accent hover:underline">
          Show all conversations
        </button>
      ) : (
        <button onClick={() => app.startNewMessage()} className="mt-3 text-sm font-medium text-accent hover:underline">
          New message
        </button>
      )}
    </div>
  );
}

export function SearchResults({ query, onPick }: { query: string; onPick?: () => void }) {
  const app = useAppState();
  const { data, isLoading, error, debouncedQuery } = useSearch(query);
  if (query.trim().length < 2) return <p className="px-5 py-4 text-[13px] text-fg-muted">Type at least 2 characters…</p>;
  if (error) return <p className="px-5 py-4 text-[13px] text-danger">Search failed. {error instanceof Error ? error.message : ""}</p>;
  if (isLoading || !data || debouncedQuery !== query.trim()) {
    return (
      <div className="px-2">
        <ListSkeleton />
      </div>
    );
  }
  const empty = !data.people.length && !data.groups.length && !data.threads.length;
  return (
    <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-2 pb-24 md:pb-3">
      {empty && <p className="px-3 py-6 text-center text-[13px] text-fg-muted">No results for “{query}”.</p>}
      {data.people.length > 0 && (
        <section>
          <SectionHeader label="People" count={data.people.length} />
          {data.people.map((p: PersonSummary) => (
            <ConversationItem key={p.id} conv={p} onPick={onPick} />
          ))}
        </section>
      )}
      {data.groups.length > 0 && (
        <section>
          <SectionHeader label="Groups" count={data.groups.length} />
          {data.groups.map((g: GroupSummary) => (
            <ConversationItem key={g.id} conv={g} onPick={onPick} />
          ))}
        </section>
      )}
      {data.threads.length > 0 && (
        <section>
          <SectionHeader label="Topics & messages" count={data.threads.length} />
          {data.threads.map((t) => (
            <button
              key={t.id}
              disabled={!t.conversation}
              onClick={() => {
                if (!t.conversation) return;
                app.openConversation(t.conversation, { threadId: t.id });
                onPick?.();
              }}
              className="flex w-full flex-col gap-0.5 rounded-xl px-3 py-2.5 text-left hover:bg-hover disabled:opacity-50"
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[13px] font-medium">{cleanSubject(t.subject)}</span>
                <span className="shrink-0 text-[11px] text-fg-subtle">{formatListTime(t.lastMessageAt)}</span>
              </span>
              <span className="truncate text-xs text-fg-muted">
                {t.participants.map((p) => displayName(p)).join(", ") || "You"} · {t.snippet}
              </span>
            </button>
          ))}
        </section>
      )}
    </div>
  );
}

export function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}
