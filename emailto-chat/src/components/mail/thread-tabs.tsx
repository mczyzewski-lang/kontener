"use client";

import { Archive, ChevronDown, Plus, Search, Users, X } from "lucide-react";
import * as React from "react";
import { cleanSubject } from "@/core/grouping";
import type { ThreadSummary } from "@/core/types";
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown";
import { Tooltip } from "@/components/ui/tooltip";
import { cn, formatListTime } from "@/lib/utils";

/** One tab per Gmail thread (threadId) with this person / group. */
export function ThreadTabs({
  threads,
  closed,
  activeId,
  newTopicActive,
  onSelect,
  onClose,
  onNewTopic,
}: {
  threads: ThreadSummary[];
  closed: string[];
  activeId: string | null;
  newTopicActive: boolean;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNewTopic: () => void;
}) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const visible = threads.filter((t) => !closed.includes(t.id) || t.id === activeId);
  const hiddenCount = threads.length - visible.length;

  React.useEffect(() => {
    const el = scrollRef.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    el?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, [activeId]);

  // Vertical wheel scrolls the tab strip horizontally on desktop.
  const onWheel = (e: React.WheelEvent) => {
    const el = scrollRef.current;
    if (!el || Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;
    el.scrollLeft += e.deltaY;
  };

  return (
    <div className="flex items-center gap-1 border-b border-border px-2 md:px-4">
      <div
        ref={scrollRef}
        onWheel={onWheel}
        role="tablist"
        aria-label="Topics"
        className="scrollbar-none flex min-w-0 flex-1 snap-x items-center gap-1 overflow-x-auto py-1.5"
      >
        {visible.map((t) => {
          const active = t.id === activeId && !newTopicActive;
          return (
            <div
              key={t.id}
              role="tab"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              onClick={() => onSelect(t.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(t.id);
                }
              }}
              title={`${t.subject}\n${t.messageCount} message${t.messageCount === 1 ? "" : "s"} · ${formatListTime(t.lastMessageAt)}`}
              className={cn(
                "group relative flex h-8 shrink-0 cursor-pointer snap-start items-center gap-1.5 rounded-lg pl-3 text-[13px] transition-colors",
                visible.length > 1 ? "pr-1.5" : "pr-3",
                active ? "bg-active font-medium text-accent" : "text-fg-muted hover:bg-hover hover:text-fg",
              )}
            >
              {t.isGroup && <Users className="size-3.5 shrink-0 opacity-70" aria-label="Group topic" />}
              {!t.inInbox && <Archive className="size-3 shrink-0 opacity-50" aria-label="Archived" />}
              <span className={cn("max-w-[11rem] truncate md:max-w-[14rem]", t.unreadCount > 0 && !active && "font-semibold text-fg")}>{cleanSubject(t.subject)}</span>
              {t.unreadCount > 0 && (
                <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-accent-fg">{t.unreadCount}</span>
              )}
              {visible.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onClose(t.id);
                  }}
                  aria-label={`Close tab ${cleanSubject(t.subject)} (the e-mails stay in Gmail)`}
                  title="Close tab — e-mails are not deleted"
                  className={cn(
                    "grid size-5 place-items-center rounded-md opacity-0 transition-opacity hover:bg-border group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:hidden",
                    active && "opacity-60",
                  )}
                >
                  <X className="size-3" />
                </button>
              )}
            </div>
          );
        })}
        {newTopicActive && (
          <div role="tab" aria-selected className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-active px-3 text-[13px] font-medium text-accent">
            <Plus className="size-3.5" /> New topic
          </div>
        )}
      </div>
      <Tooltip content="New topic — starts a separate e-mail thread">
        <button onClick={onNewTopic} className="grid size-8 shrink-0 place-items-center rounded-lg text-fg-muted hover:bg-hover hover:text-accent" aria-label="New topic">
          <Plus className="size-4" />
        </button>
      </Tooltip>
      {threads.length > 1 && <AllTopicsMenu threads={threads} closed={closed} activeId={activeId} hiddenCount={hiddenCount} onSelect={onSelect} />}
    </div>
  );
}

function AllTopicsMenu({ threads, closed, activeId, hiddenCount, onSelect }: { threads: ThreadSummary[]; closed: string[]; activeId: string | null; hiddenCount: number; onSelect: (id: string) => void }) {
  const [q, setQ] = React.useState("");
  const filtered = threads.filter((t) => t.subject.toLowerCase().includes(q.toLowerCase()));
  return (
    <DropdownMenu onOpenChange={(o) => !o && setQ("")}>
      <DropdownMenuTrigger asChild>
        <button className="flex h-8 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-medium text-fg-muted hover:bg-hover hover:text-fg" aria-label="All topics">
          {threads.length}
          {hiddenCount > 0 && <span className="text-fg-subtle">({hiddenCount} closed)</span>}
          <ChevronDown className="size-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-80 p-0">
        <DropdownMenuLabel className="px-3 pt-3">All topics</DropdownMenuLabel>
        {threads.length > 5 && (
          <div className="relative px-2 pb-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-3.5 -translate-y-1/2 text-fg-subtle" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              placeholder="Find a topic"
              className="h-8 w-full rounded-lg bg-muted pl-7 pr-2 text-[13px] outline-none"
            />
          </div>
        )}
        <div className="max-h-80 overflow-y-auto p-1">
          {filtered.map((t) => (
            <button
              key={t.id}
              onClick={() => onSelect(t.id)}
              className={cn("flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-hover", t.id === activeId && "bg-active")}
            >
              <span className="min-w-0 flex-1">
                <span className={cn("block truncate text-[13px]", t.unreadCount ? "font-semibold" : "font-medium")}>
                  {t.isGroup && <Users className="mr-1 inline size-3 align-[-1px] text-fg-subtle" />}
                  {cleanSubject(t.subject)}
                </span>
                <span className="block truncate text-[11px] text-fg-muted">
                  {formatListTime(t.lastMessageAt)} · {t.messageCount} msg{closed.includes(t.id) ? " · closed tab" : ""}
                  {!t.inInbox ? " · archived" : ""}
                </span>
              </span>
              {t.unreadCount > 0 && <span className="size-2 shrink-0 rounded-full bg-accent" />}
            </button>
          ))}
          {!filtered.length && <p className="px-3 py-4 text-center text-xs text-fg-muted">No topics match.</p>}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
