"use client";

import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Download,
  ExternalLink,
  Info,
  Mail,
  MessageCircle,
  MoreHorizontal,
  PanelRight,
  Star,
  StarOff,
  Trash2,
} from "lucide-react";
import * as React from "react";
import { displayName } from "@/core/addresses";
import type { Address, AttachmentView, ConversationRef, ConversationSummary, ThreadDetail, ThreadSummary } from "@/core/types";
import { Avatar, GroupAvatar } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { IconButton } from "@/components/ui/icon-button";
import { Skeleton } from "@/components/ui/skeleton";
import { LogoMark } from "@/components/brand/logo";
import { cn } from "@/lib/utils";
import { refKey, useAppState } from "./app-state";
import { AttachmentViewer } from "./attachment-viewer";
import { Composer } from "./composer";
import { useConversation, useMail, useThread } from "./mail-context";
import type { BubbleActions } from "./message-bubble";
import { useToast } from "./send-queue";
import { isTyping } from "./sidebar";
import { ThreadTabs } from "./thread-tabs";
import { Timeline } from "./timeline";
import { useMailActions } from "./use-mail-actions";

export function ConversationView({ className }: { className?: string }) {
  const app = useAppState();
  if (app.newMessage) return <NewMessageView className={className} />;
  if (!app.selected) return <NoConversation className={className} />;
  return <ConversationPane key={refKey(app.selected)} convRef={app.selected} className={className} />;
}

function NoConversation({ className }: { className?: string }) {
  const app = useAppState();
  return (
    <section className={cn("flex flex-1 flex-col items-center justify-center gap-4 bg-bg p-8 text-center", className)}>
      <div className="grid size-16 place-items-center rounded-3xl bg-accent-soft">
        <LogoMark className="size-9" />
      </div>
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Pick a person to start chatting</h2>
        <p className="mx-auto mt-1 max-w-sm text-sm text-fg-muted">Every topic with them is a tab. Every e-mail is a bubble. Replies go out as regular e-mail.</p>
      </div>
      <div className="flex flex-wrap justify-center gap-2 text-xs text-fg-muted">
        <Kbd k="J / K">next / previous person</Kbd>
        <Kbd k="[ / ]">switch topic</Kbd>
        <Kbd k="C">new message</Kbd>
        <Kbd k="?">all shortcuts</Kbd>
      </div>
      <button onClick={() => app.startNewMessage()} className="text-sm font-medium text-accent hover:underline">
        Start a new conversation
      </button>
    </section>
  );
}

function Kbd({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5 rounded-lg border border-border px-2 py-1">
      <kbd className="font-mono text-[11px] font-semibold text-fg">{k}</kbd> {children}
    </span>
  );
}

function pickDefaultThread(threads: ThreadSummary[], closed: string[]): string | null {
  const open = threads.filter((t) => !closed.includes(t.id));
  const pool = open.length ? open : threads;
  return pool[0]?.id ?? null;
}

function ConversationPane({ convRef, className }: { convRef: ConversationRef; className?: string }) {
  const app = useAppState();
  const { client } = useMail();
  const toast = useToast();
  const { modifyThread, modifyMessage } = useMailActions();
  const { data: conv, error: convError, isLoading: convLoading } = useConversation(convRef);
  const closed = app.closedTabs(convRef);
  const newTopicActive = app.composerIntent?.kind === "newTopic";

  const threads = React.useMemo(() => conv?.threads ?? [], [conv]);
  const remembered = app.activeThreadId(convRef);
  const activeId = remembered && threads.some((t) => t.id === remembered) ? remembered : pickDefaultThread(threads, closed);
  const { data: thread, error: threadError, isLoading: threadLoading, mutate: reloadThread } = useThread(newTopicActive ? null : activeId);

  // Capture where unread messages start *before* we mark them read.
  const [firstUnread, setFirstUnread] = React.useState<{ threadId: string; messageId: string } | null>(null);
  React.useEffect(() => {
    if (!thread || firstUnread?.threadId === thread.thread.id) return;
    const m = thread.messages.find((x) => x.unread && !x.fromMe);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- snapshot of server state on first load
    if (m) setFirstUnread({ threadId: thread.thread.id, messageId: m.id });
  }, [thread, firstUnread]);

  // Mark the visible topic as read (only that one thread).
  React.useEffect(() => {
    if (!thread || thread.thread.unreadCount === 0 || !thread.messages.some((m) => m.unread)) return;
    if (document.visibilityState !== "visible") return;
    const id = window.setTimeout(() => void modifyThread(thread.thread.id, "read", { silent: true }), 700);
    return () => window.clearTimeout(id);
  }, [thread, modifyThread]);

  // Viewer for attachments clicked inside bubbles.
  const [viewer, setViewer] = React.useState<{ list: AttachmentView[]; index: number } | null>(null);
  const [original, setOriginal] = React.useState<{ id: string; text: string | null; error?: string } | null>(null);

  const actions: BubbleActions = React.useMemo(
    () => ({
      onReply: (m) => app.setComposerIntent({ kind: "reply", message: m, all: false, nonce: Date.now() }),
      onReplyAll: (m) => app.setComposerIntent({ kind: "reply", message: m, all: true, nonce: Date.now() }),
      onForward: (m) => app.setComposerIntent({ kind: "forward", message: m, nonce: Date.now() }),
      onToggleStar: (m) => void modifyMessage(m.threadId, m.id, m.starred ? "unstar" : "star"),
      onMarkUnread: (m) => void modifyMessage(m.threadId, m.id, "unread"),
      onShowOriginal: (m) => {
        setOriginal({ id: m.id, text: null });
        client
          .getOriginal(m.id)
          .then((text) => setOriginal((o) => (o?.id === m.id ? { ...o, text } : o)))
          .catch((e) => setOriginal((o) => (o?.id === m.id ? { ...o, error: e instanceof Error ? e.message : "Failed to load" } : o)));
      },
      onOpenAttachment: (a) => {
        const list = (thread?.messages ?? []).flatMap((m) => m.attachments);
        setViewer({ list, index: Math.max(0, list.findIndex((x) => x.id === a.id && x.messageId === a.messageId)) });
      },
      onCopied: () => toast({ message: "Copied to clipboard", tone: "success" }),
    }),
    [app, modifyMessage, client, thread, toast],
  );

  // Topic-level keyboard shortcuts.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      const visible = threads.filter((t) => !closed.includes(t.id) || t.id === activeId);
      const idx = visible.findIndex((t) => t.id === activeId);
      if ((e.key === "]" || e.key === "[") && visible.length) {
        const next = visible[(idx + (e.key === "]" ? 1 : -1) + visible.length) % visible.length];
        app.setActiveThread(convRef, next.id);
      } else if (e.key === "e" && activeId) {
        const t = threads.find((x) => x.id === activeId);
        void modifyThread(activeId, t?.inInbox ? "archive" : "unarchive");
      } else if (e.key === "u" && activeId) {
        void modifyThread(activeId, "unread");
      } else if (e.key === "s" && activeId) {
        const t = threads.find((x) => x.id === activeId);
        void modifyThread(activeId, t?.starred ? "unstar" : "star");
      } else if (e.key === "r") {
        e.preventDefault();
        document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Message"]')?.focus();
      } else if (e.key === "n") {
        app.setComposerIntent({ kind: "newTopic", nonce: Date.now() });
      } else return;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [threads, closed, activeId, app, convRef, modifyThread]);

  if (convError && !conv) {
    return (
      <section className={cn("flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center", className)}>
        <p className="font-medium">This conversation isn’t available</p>
        <p className="text-sm text-fg-muted">It may have been archived, deleted, or moved since the last sync.</p>
        <button onClick={app.closeConversation} className="mt-2 text-sm font-medium text-accent hover:underline">
          Back to conversations
        </button>
      </section>
    );
  }

  const summary = conv?.conversation;
  const activeThread = threads.find((t) => t.id === activeId) ?? null;
  const recipientsForNewTopic: Address[] = summary ? (summary.kind === "person" ? [{ email: summary.email, name: summary.name }] : summary.members) : [];
  const title = summary ? conversationTitle(summary) : "";
  const intent = app.composerIntent;
  const threadIntent =
    intent && intent.kind !== "newTopic" && thread && intent.message.threadId === thread.thread.id
      ? intent.kind === "forward"
        ? { kind: "forward" as const, message: intent.message }
        : { kind: intent.all ? ("replyAll" as const) : ("reply" as const), message: intent.message }
      : null;

  return (
    <section className={cn("flex min-h-0 min-w-0 flex-1 flex-col bg-bg", className)} aria-label="Conversation">
      <ConversationHeader summary={summary} loading={convLoading && !conv} activeThread={activeThread} onAction={(a) => activeId && void modifyThread(activeId, a)} />

      {conv && threads.length > 0 && (
        <ThreadTabs
          threads={threads}
          closed={closed}
          activeId={activeId}
          newTopicActive={newTopicActive}
          onSelect={(id) => app.setActiveThread(convRef, id)}
          onClose={(id) => {
            app.closeTab(convRef, id);
            if (id === activeId) {
              const next = threads.find((t) => t.id !== id && !closed.includes(t.id));
              if (next) app.setActiveThread(convRef, next.id);
            }
          }}
          onNewTopic={() => app.setComposerIntent({ kind: "newTopic", nonce: Date.now() })}
        />
      )}

      {newTopicActive && summary ? (
        <>
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
            <div className="grid size-12 place-items-center rounded-2xl bg-accent-soft text-accent">
              <MessageCircle className="size-6" />
            </div>
            <p className="font-medium">New topic with {title}</p>
            <p className="max-w-sm text-sm text-fg-muted">This sends a new e-mail with its own subject, so it becomes a separate tab — it won’t be appended to an existing thread.</p>
          </div>
          <Composer
            key={`newtopic:${refKey(convRef)}`}
            draftKey={`newtopic:${refKey(convRef)}`}
            context={{ kind: "newTopic", recipients: recipientsForNewTopic, title }}
            onCancel={() => app.setComposerIntent(null)}
            onSent={(result) => {
              app.setComposerIntent(null);
              app.setActiveThread(convRef, result.threadId);
            }}
          />
        </>
      ) : conv && !threads.length ? (
        <>
          <div className="flex flex-1 flex-col items-center justify-center p-8 text-center text-sm text-fg-muted">No topics with {title} in this view yet. Start one below.</div>
          {summary && (
            <Composer
              key={`empty:${refKey(convRef)}`}
              draftKey={`newtopic:${refKey(convRef)}`}
              context={{ kind: "newTopic", recipients: recipientsForNewTopic, title }}
              onSent={(result) => app.setActiveThread(convRef, result.threadId)}
            />
          )}
        </>
      ) : (
        <>
          {activeId ? (
            <Timeline
              threadId={activeId}
              data={thread}
              error={threadError}
              isLoading={threadLoading || (convLoading && !conv)}
              onRetryLoad={() => void reloadThread()}
              actions={actions}
              highlightMessageId={app.highlightMessageId}
              onHighlightDone={app.clearHighlight}
              firstUnreadId={firstUnread?.threadId === activeId ? firstUnread.messageId : null}
            />
          ) : (
            <TimelineLoading />
          )}
          {thread && thread.thread.id === activeId && (
            <Composer
              key={`thread:${activeId}`}
              draftKey={`thread:${activeId}`}
              context={{ kind: "thread", thread: thread as ThreadDetail, intent: threadIntent }}
              onCancel={() => app.setComposerIntent(null)}
              onSent={(result, mode) => {
                app.setComposerIntent(null);
                if (mode === "reply" || mode === "replyAll") app.setActiveThread(convRef, result.threadId);
              }}
            />
          )}
        </>
      )}

      <AttachmentViewer
        attachments={viewer?.list ?? []}
        index={viewer?.index ?? null}
        onIndexChange={(i) => setViewer((v) => (v ? { ...v, index: i } : v))}
        onClose={() => setViewer(null)}
        onShowInConversation={(a) => {
          setViewer(null);
          app.setActiveThread(convRef, a.threadId, a.messageId);
        }}
      />
      <OriginalDialog original={original} onClose={() => setOriginal(null)} />
    </section>
  );
}

function TimelineLoading() {
  return (
    <div className="flex flex-1 flex-col justify-end gap-3 p-6">
      <Skeleton className="h-10 w-1/2 rounded-2xl" />
      <Skeleton className="ml-auto h-10 w-1/3 rounded-2xl" />
      <Skeleton className="h-16 w-2/3 rounded-2xl" />
    </div>
  );
}

export function conversationTitle(c: ConversationSummary): string {
  if (c.kind === "group") return c.title;
  return c.isSelf ? "Notes to self" : displayName(c);
}

function ConversationHeader({
  summary,
  loading,
  activeThread,
  onAction,
}: {
  summary: ConversationSummary | undefined;
  loading: boolean;
  activeThread: ThreadSummary | null;
  onAction: (a: "archive" | "unarchive" | "star" | "unstar" | "unread" | "trash") => void;
}) {
  const app = useAppState();
  const { account } = useMail();
  const gmailUrl =
    activeThread && account?.mode === "live" && account.mailAccount
      ? `https://mail.google.com/mail/?authuser=${encodeURIComponent(account.mailAccount.email)}#all/${activeThread.id}`
      : null;

  return (
    <header className="flex h-[60px] shrink-0 items-center gap-2 border-b border-border px-2 pt-safe md:h-16 md:px-4">
      <button onClick={app.closeConversation} className="grid size-9 place-items-center rounded-lg text-accent hover:bg-hover md:hidden" aria-label="Back to conversations">
        <ArrowLeft className="size-5" />
      </button>
      {loading || !summary ? (
        <div className="flex items-center gap-3">
          <Skeleton className="size-10 rounded-full" />
          <div className="space-y-1.5">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3 w-44" />
          </div>
        </div>
      ) : (
        <button
          className="flex min-w-0 items-center gap-3 rounded-lg py-1 pr-2 text-left hover:bg-hover md:hover:bg-transparent"
          onClick={() => {
            app.setShowDetails(true);
            app.setMobileView("details");
          }}
          aria-label="Show contact details"
        >
          {summary.kind === "person" ? <Avatar email={summary.email} name={summary.name} size="md" /> : <GroupAvatar members={summary.members} size="md" />}
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-semibold leading-tight">{conversationTitle(summary)}</span>
            <span className="block truncate text-xs text-fg-muted">
              {summary.kind === "person" ? summary.email : `${summary.members.length + 1} people · ${summary.members.map((m) => m.email).join(", ")}`}
            </span>
          </span>
        </button>
      )}
      <div className="ml-auto flex items-center gap-0.5">
        {activeThread && (
          <>
            <IconButton
              label={activeThread.inInbox ? "Archive this topic" : "Move topic to Inbox"}
              shortcut="E"
              onClick={() => onAction(activeThread.inInbox ? "archive" : "unarchive")}
              className="hidden sm:inline-flex"
            >
              {activeThread.inInbox ? <Archive /> : <ArchiveRestore />}
            </IconButton>
            <IconButton label={activeThread.starred ? "Unstar topic" : "Star topic"} shortcut="S" onClick={() => onAction(activeThread.starred ? "unstar" : "star")} className="hidden sm:inline-flex" active={activeThread.starred}>
              <Star className={cn(activeThread.starred && "fill-current")} />
            </IconButton>
          </>
        )}
        <IconButton label="Contact details" shortcut="I" onClick={() => (app.setShowDetails((v) => !v), app.setMobileView("details"))} active={app.showDetails} className="hidden xl:inline-flex">
          <PanelRight />
        </IconButton>
        <IconButton label="Contact details" onClick={() => (app.setShowDetails(true), app.setMobileView("details"))} className="xl:hidden">
          <Info />
        </IconButton>
        {activeThread && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="grid size-9 place-items-center rounded-lg text-fg-muted hover:bg-hover hover:text-fg" aria-label="Topic actions">
                <MoreHorizontal className="size-[18px]" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem icon={activeThread.inInbox ? <Archive /> : <ArchiveRestore />} shortcut="E" onSelect={() => onAction(activeThread.inInbox ? "archive" : "unarchive")}>
                {activeThread.inInbox ? "Archive this topic" : "Move to Inbox"}
              </DropdownMenuItem>
              <DropdownMenuItem icon={<Mail />} shortcut="U" onSelect={() => onAction("unread")}>
                Mark topic unread
              </DropdownMenuItem>
              <DropdownMenuItem icon={activeThread.starred ? <StarOff /> : <Star />} shortcut="S" onSelect={() => onAction(activeThread.starred ? "unstar" : "star")}>
                {activeThread.starred ? "Remove star" : "Star topic"}
              </DropdownMenuItem>
              {gmailUrl && (
                <DropdownMenuItem icon={<ExternalLink />} onSelect={() => window.open(gmailUrl, "_blank", "noopener,noreferrer")}>
                  Open in Gmail
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem icon={<Trash2 />} destructive onSelect={() => onAction("trash")}>
                Move topic to Trash
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  );
}

function OriginalDialog({ original, onClose }: { original: { id: string; text: string | null; error?: string } | null; onClose: () => void }) {
  const download = () => {
    if (!original?.text) return;
    const url = URL.createObjectURL(new Blob([original.text], { type: "message/rfc822" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `message-${original.id}.eml`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <Dialog open={!!original} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Original message" description="Full headers and raw source, exactly as stored in Gmail." className="max-w-3xl">
        <div className="min-h-0 flex-1 overflow-auto px-5 pb-2 pt-3">
          {original?.error ? (
            <p className="text-sm text-danger">{original.error}</p>
          ) : original?.text == null ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-3" />
              ))}
            </div>
          ) : (
            <pre className="whitespace-pre-wrap break-all rounded-lg bg-subtle p-3 font-mono text-[11px] leading-relaxed text-fg-muted">{original.text}</pre>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <button onClick={download} disabled={!original?.text} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-accent hover:bg-hover disabled:opacity-50">
            <Download className="size-4" /> Download .eml
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function NewMessageView({ className }: { className?: string }) {
  const app = useAppState();
  const { client } = useMail();
  const toast = useToast();
  return (
    <section className={cn("flex min-h-0 min-w-0 flex-1 flex-col bg-bg", className)} aria-label="New message">
      <header className="flex h-[60px] shrink-0 items-center gap-2 border-b border-border px-2 pt-safe md:h-16 md:px-5">
        <button onClick={app.closeNewMessage} className="grid size-9 place-items-center rounded-lg text-accent hover:bg-hover md:hidden" aria-label="Back">
          <ArrowLeft className="size-5" />
        </button>
        <h2 className="text-[15px] font-semibold">New message</h2>
        <button onClick={app.closeNewMessage} className="ml-auto hidden rounded-lg px-3 py-1.5 text-sm text-fg-muted hover:bg-hover hover:text-fg md:block">
          Cancel
        </button>
      </header>
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
        <div className="grid size-12 place-items-center rounded-2xl bg-accent-soft text-accent">
          <MessageCircle className="size-6" />
        </div>
        <p className="font-medium">Start a conversation</p>
        <p className="max-w-sm text-sm text-fg-muted">Add one person for a 1:1 chat, or several for a group. They’ll receive a normal e-mail — no app needed.</p>
      </div>
      <Composer
        draftKey="new-message"
        context={{ kind: "newMessage", initialTo: app.newMessage?.to ?? [] }}
        onSent={async (result, _mode, to) => {
          app.closeNewMessage();
          toast({ message: "Sent", tone: "success" });
          // Jump into the conversation the new thread belongs to.
          try {
            if (to.length === 1) {
              const person = await client.findPerson(to[0].email);
              if (person) app.openConversation({ kind: "person", id: person.id }, { threadId: result.threadId });
            } else {
              const thread = await client.getThread(result.threadId);
              if (thread.thread.groupId) app.openConversation({ kind: "group", id: thread.thread.groupId }, { threadId: result.threadId });
            }
          } catch {
            /* the conversation will appear after the next sync */
          }
        }}
      />
    </section>
  );
}

