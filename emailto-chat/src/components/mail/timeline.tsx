"use client";

import { ArrowDown, Lock, RefreshCw } from "lucide-react";
import * as React from "react";
import { cleanSubject } from "@/core/grouping";
import type { MessageView, ThreadDetail } from "@/core/types";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, dayKey, formatDayDivider } from "@/lib/utils";
import { useMail } from "./mail-context";
import { MessageBubble, type BubbleActions } from "./message-bubble";
import { pendingToView, useSendQueue } from "./send-queue";

/** Remembered scroll positions per thread — switching tabs keeps your place. */
const scrollPositions = new Map<string, number>();

const RUN_GAP_MS = 10 * 60 * 1000;

export function Timeline({
  threadId,
  data,
  error,
  isLoading,
  onRetryLoad,
  actions,
  highlightMessageId,
  onHighlightDone,
  firstUnreadId,
}: {
  threadId: string;
  data: ThreadDetail | undefined;
  error: unknown;
  isLoading: boolean;
  onRetryLoad: () => void;
  actions: BubbleActions;
  highlightMessageId: string | null;
  onHighlightDone: () => void;
  firstUnreadId: string | null;
}) {
  const { prefs, account } = useMail();
  const { pending, retry, discard } = useSendQueue();
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = React.useState(true);
  const restoredFor = React.useRef<string | null>(null);

  const me = { email: account?.mailAccount?.email ?? account?.user.email ?? "", name: account?.user.name ?? null };
  const pendingHere = pending.filter((p) => p.threadId === threadId);
  const messages: (MessageView & { _pending?: "sending" | "failed"; _key?: string })[] = React.useMemo(() => {
    const real = data?.thread.id === threadId ? data.messages : [];
    return [...real, ...pendingHere.map((p) => ({ ...pendingToView(p, me), _pending: p.status, _key: p.key }))];
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `me` is derived from account
  }, [data, threadId, pendingHere, account]);

  // Restore scroll position (or jump to the newest message) once per thread.
  React.useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !data || data.thread.id !== threadId || restoredFor.current === threadId) return;
    restoredFor.current = threadId;
    if (highlightMessageId) return;
    const saved = scrollPositions.get(threadId);
    el.scrollTop = saved ?? el.scrollHeight;
    if (saved !== undefined) return;
    // Late layout (fonts, images, collapsed cards) can grow the content — keep pinned to the newest message.
    const pin = () => {
      el.scrollTop = el.scrollHeight;
    };
    const raf = requestAnimationFrame(pin);
    const t1 = window.setTimeout(pin, 150);
    const t2 = window.setTimeout(pin, 500);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [data, threadId, highlightMessageId]);

  // New messages (incoming or optimistic): stick to the bottom if the user was there.
  const lastId = messages[messages.length - 1]?.id;
  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el || restoredFor.current !== threadId) return;
    if (atBottom) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the newest message changes
  }, [lastId]);

  // "Find in conversation": scroll to and flash a specific message.
  React.useEffect(() => {
    if (!highlightMessageId || !data) return;
    const node = document.getElementById(`msg-${highlightMessageId}`);
    if (!node) return;
    node.scrollIntoView({ block: "center", behavior: "smooth" });
    const t = window.setTimeout(onHighlightDone, 2200);
    return () => window.clearTimeout(t);
  }, [highlightMessageId, data, onHighlightDone]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    scrollPositions.set(threadId, el.scrollTop);
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
  };

  if (error && !data) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-sm font-medium">Couldn’t load this conversation</p>
        <p className="max-w-sm text-[13px] text-fg-muted">{error instanceof Error ? error.message : "Something went wrong."}</p>
        <button onClick={onRetryLoad} className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline">
          <RefreshCw className="size-3.5" /> Try again
        </button>
      </div>
    );
  }

  if ((isLoading || !data || data.thread.id !== threadId) && !pendingHere.length) return <TimelineSkeleton />;

  const isGroup = data?.thread.isGroup ?? false;

  return (
    <div className="relative min-h-0 flex-1">
      <div ref={scrollRef} onScroll={onScroll} className="scrollbar-thin h-full overflow-y-auto overscroll-contain pb-4 pt-2" role="log" aria-label="Messages" aria-live="polite">
        {data && (
          <div className="mx-auto mb-2 mt-4 flex max-w-md flex-col items-center px-6 text-center">
            <p className="text-[13px] font-semibold text-fg">{cleanSubject(data.thread.subject)}</p>
            <p className="mt-0.5 flex items-center gap-1 text-[11px] text-fg-subtle">
              <Lock className="size-3" />
              {data.thread.messageCount} e-mail{data.thread.messageCount === 1 ? "" : "s"} in this topic · delivered as regular e-mail
            </p>
          </div>
        )}
        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const next = messages[i + 1];
          const newDay = !prev || dayKey(prev.date) !== dayKey(m.date);
          const sameAsPrev = !!prev && !newDay && prev.from.email === m.from.email && new Date(m.date).getTime() - new Date(prev.date).getTime() < RUN_GAP_MS;
          const sameAsNext = !!next && dayKey(next.date) === dayKey(m.date) && next.from.email === m.from.email && new Date(next.date).getTime() - new Date(m.date).getTime() < RUN_GAP_MS;
          const recipientsChanged = !prev || recipientKey(prev) !== recipientKey(m);
          return (
            <React.Fragment key={m._key ?? m.id}>
              {newDay && <DayDivider iso={m.date} />}
              {m.id === firstUnreadId && (
                <div className="my-3 flex items-center gap-3 px-6" role="separator">
                  <span className="h-px flex-1 bg-accent/30" />
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-accent">New</span>
                  <span className="h-px flex-1 bg-accent/30" />
                </div>
              )}
              <MessageBubble
                message={m}
                isGroup={isGroup}
                firstInRun={!sameAsPrev}
                lastInRun={!sameAsNext}
                showRecipients={(isGroup || m.cc.length > 0 || m.to.length > 1) && (recipientsChanged || !sameAsNext)}
                highlighted={highlightMessageId === m.id}
                alwaysLoadImages={prefs.alwaysLoadRemoteImages}
                actions={actions}
                pendingState={m._pending}
                onRetry={m._key ? () => void retry(m._key!) : undefined}
                onDiscard={m._key ? () => discard(m._key!) : undefined}
              />
            </React.Fragment>
          );
        })}
      </div>
      {!atBottom && (
        <button
          onClick={() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })}
          className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-border bg-panel px-3 py-1.5 text-xs font-medium text-fg shadow-md animate-pop hover:bg-hover"
        >
          <ArrowDown className="size-3.5" /> Latest
        </button>
      )}
    </div>
  );
}

function recipientKey(m: MessageView) {
  return [...m.to, ...m.cc].map((a) => a.email).sort().join(",");
}

function DayDivider({ iso }: { iso: string }) {
  return (
    <div className="sticky top-1 z-10 my-3 flex justify-center">
      <span className="rounded-full border border-border bg-panel/90 px-3 py-0.5 text-[11px] font-medium text-fg-muted shadow-sm backdrop-blur">{formatDayDivider(iso)}</span>
    </div>
  );
}

function TimelineSkeleton() {
  return (
    <div className="flex flex-1 flex-col justify-end gap-3 px-6 py-6" aria-busy="true" aria-label="Loading messages">
      {[60, 40, 72, 30, 55].map((w, i) => (
        <div key={i} className={cn("flex items-end gap-2", i % 2 ? "justify-end" : "justify-start")}>
          {i % 2 === 0 && <Skeleton className="size-8 rounded-full" />}
          <div style={{ width: `${w}%` }}>
            <Skeleton className={cn("h-11 rounded-[20px]", i % 2 ? "rounded-br-md" : "rounded-bl-md")} />
          </div>
        </div>
      ))}
    </div>
  );
}

