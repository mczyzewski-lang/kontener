"use client";

import { ArrowLeft, Check, Copy, LayoutGrid, List as ListIcon, MessageSquareText, Paperclip, Users, X } from "lucide-react";
import * as React from "react";
import { displayName } from "@/core/addresses";
import { formatBytes } from "@/core/attachments";
import { cleanSubject } from "@/core/grouping";
import type { Address, AttachmentKind, AttachmentView, ConversationRef } from "@/core/types";
import { Avatar, GroupAvatar } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatListTime } from "@/lib/utils";
import { refKey, useAppState } from "./app-state";
import { AttachmentViewer, FileIcon, useObjectUrl } from "./attachment-viewer";
import { conversationTitle } from "./conversation-view";
import { useAttachments, useConversation, useMail, useThread } from "./mail-context";
import { useToast } from "./send-queue";

type FileFilter = "all" | AttachmentKind;

export function DetailsPanel({ className }: { className?: string }) {
  const app = useAppState();
  if (!app.selected || app.newMessage) return null;
  return <DetailsContent key={refKey(app.selected)} convRef={app.selected} className={className} />;
}

function DetailsContent({ convRef, className }: { convRef: ConversationRef; className?: string }) {
  const app = useAppState();
  const { self, account, client } = useMail();
  const toast = useToast();
  const { data: conv } = useConversation(convRef);
  const activeId = app.activeThreadId(convRef) ?? conv?.threads[0]?.id ?? null;
  const { data: thread } = useThread(activeId);
  const [scope, setScope] = React.useState<"thread" | "all">("all");
  const [filter, setFilter] = React.useState<FileFilter>("all");
  const [layout, setLayout] = React.useState<"grid" | "list">("grid");
  const [viewerIndex, setViewerIndex] = React.useState<number | null>(null);
  const [copied, setCopied] = React.useState<string | null>(null);

  const attachmentScope = scope === "thread" && activeId ? { kind: "thread" as const, threadId: activeId } : { kind: convRef.kind, id: convRef.id };
  const { data: files, isLoading: filesLoading } = useAttachments(attachmentScope);
  const filtered = (files ?? []).filter((f) => filter === "all" || f.kind === filter);

  const summary = conv?.conversation;
  const threadParticipants: Address[] = React.useMemo(() => {
    if (!thread) return [];
    const seen = new Map<string, Address>();
    for (const m of thread.messages) for (const a of [m.from, ...m.to, ...m.cc]) if (!seen.has(a.email) || (a.name && !seen.get(a.email)!.name)) seen.set(a.email, a);
    return [...seen.values()];
  }, [thread]);

  const copy = async (email: string) => {
    try {
      await navigator.clipboard.writeText(email);
      setCopied(email);
      toast({ message: "E-mail address copied", tone: "success" });
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      /* ignore */
    }
  };

  const openPerson = async (email: string) => {
    if (self.addresses.has(email)) return;
    const p = await client.findPerson(email);
    if (p) app.openConversation({ kind: "person", id: p.id });
  };

  return (
    <aside className={cn("flex h-full min-h-0 flex-col bg-subtle md:border-l", className)} aria-label="Contact details">
      <div className="flex h-[60px] shrink-0 items-center gap-2 px-2 pt-safe md:h-16 md:px-4">
        <button onClick={() => app.setMobileView("conversation")} className="grid size-9 place-items-center rounded-lg text-accent hover:bg-hover md:hidden" aria-label="Back to conversation">
          <ArrowLeft className="size-5" />
        </button>
        <h2 className="text-sm font-semibold">Details</h2>
        <button onClick={() => app.setShowDetails(false)} className="ml-auto hidden rounded-lg p-1.5 text-fg-muted hover:bg-hover hover:text-fg md:block" aria-label="Hide details">
          <X className="size-4" />
        </button>
      </div>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {/* Profile */}
        <div className="flex flex-col items-center px-5 pb-5 pt-2 text-center">
          {!summary ? (
            <>
              <Skeleton className="size-20 rounded-full" />
              <Skeleton className="mt-3 h-4 w-32" />
            </>
          ) : (
            <>
              {summary.kind === "person" ? <Avatar email={summary.email} name={summary.name} size="xl" /> : <GroupAvatar members={summary.members} size="xl" />}
              <h3 className="mt-3 text-base font-semibold">{conversationTitle(summary)}</h3>
              {summary.kind === "person" ? (
                <button onClick={() => void copy(summary.email)} className="mt-0.5 flex items-center gap-1.5 rounded-md px-1.5 text-[13px] text-fg-muted hover:text-fg" title="Copy address">
                  {summary.email}
                  {copied === summary.email ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
                </button>
              ) : (
                <p className="mt-0.5 text-[13px] text-fg-muted">Group · {summary.members.length + 1} people</p>
              )}
              <p className="mt-2 text-xs text-fg-subtle">
                {conv?.threads.length ?? 0} topic{conv?.threads.length === 1 ? "" : "s"} · {(files ?? []).length} file{(files ?? []).length === 1 ? "" : "s"}
                {scope === "thread" ? " in this topic" : ""}
              </p>
            </>
          )}
        </div>

        {/* People */}
        {summary?.kind === "group" && (
          <Section title="Members" icon={<Users className="size-3.5" />}>
            {[{ email: account?.mailAccount?.email ?? account?.user.email ?? "", name: "You" }, ...summary.members].map((m) => (
              <PersonRow key={m.email} person={m} isMe={self.addresses.has(m.email)} copied={copied === m.email} onCopy={() => void copy(m.email)} onOpen={() => void openPerson(m.email)} />
            ))}
          </Section>
        )}
        {threadParticipants.length > 0 && (
          <Section title="In this topic" icon={<Users className="size-3.5" />}>
            {threadParticipants.map((p) => (
              <PersonRow key={p.email} person={p} isMe={self.addresses.has(p.email)} copied={copied === p.email} onCopy={() => void copy(p.email)} onOpen={() => void openPerson(p.email)} />
            ))}
          </Section>
        )}

        {/* Shared files */}
        <Section
          title="Shared media & files"
          icon={<Paperclip className="size-3.5" />}
          right={
            <div className="flex rounded-md bg-muted p-0.5">
              <button onClick={() => setLayout("grid")} className={cn("rounded p-1", layout === "grid" ? "bg-panel text-fg shadow-sm" : "text-fg-muted")} aria-label="Grid view" aria-pressed={layout === "grid"}>
                <LayoutGrid className="size-3.5" />
              </button>
              <button onClick={() => setLayout("list")} className={cn("rounded p-1", layout === "list" ? "bg-panel text-fg shadow-sm" : "text-fg-muted")} aria-label="List view" aria-pressed={layout === "list"}>
                <ListIcon className="size-3.5" />
              </button>
            </div>
          }
        >
          <div className="mb-2 flex flex-wrap gap-1">
            <Segmented
              value={scope}
              onChange={(v) => setScope(v)}
              options={[
                ["all", summary?.kind === "group" ? "All topics" : `All with ${summary && summary.kind === "person" ? displayName(summary).split(" ")[0] : "them"}`],
                ["thread", "This topic"],
              ]}
            />
          </div>
          <div className="mb-3 flex flex-wrap gap-1">
            {(
              [
                ["all", "All"],
                ["image", "Images"],
                ["document", "Documents"],
                ["other", "Other"],
              ] as const
            ).map(([id, label]) => {
              const count = (files ?? []).filter((f) => id === "all" || f.kind === id).length;
              return (
                <button
                  key={id}
                  onClick={() => setFilter(id)}
                  className={cn("rounded-full border px-2.5 py-0.5 text-xs transition-colors", filter === id ? "border-accent bg-accent-soft font-medium text-accent" : "border-border text-fg-muted hover:text-fg")}
                >
                  {label} <span className="opacity-60">{count}</span>
                </button>
              );
            })}
          </div>
          {filesLoading && !files ? (
            <div className="grid grid-cols-3 gap-1.5">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="aspect-square rounded-lg" />
              ))}
            </div>
          ) : !filtered.length ? (
            <p className="rounded-lg border border-dashed border-border px-3 py-5 text-center text-xs text-fg-muted">No {filter === "all" ? "files" : filter === "image" ? "images" : filter === "document" ? "documents" : "other files"} shared yet.</p>
          ) : layout === "grid" ? (
            <div className="grid grid-cols-3 gap-1.5">
              {filtered.map((f, i) => (
                <GridTile key={`${f.messageId}-${f.id}`} file={f} onOpen={() => setViewerIndex(i)} />
              ))}
            </div>
          ) : (
            <ul className="-mx-1 space-y-0.5">
              {filtered.map((f, i) => (
                <li key={`${f.messageId}-${f.id}`}>
                  <button onClick={() => setViewerIndex(i)} className="flex w-full items-center gap-2.5 rounded-lg px-1 py-1.5 text-left hover:bg-hover">
                    <FileIcon attachment={f} className="size-9" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium">{f.filename}</span>
                      <span className="block truncate text-[11px] text-fg-muted">
                        {f.fromMe ? "You" : f.senderName} · {formatListTime(f.date)} · {formatBytes(f.size)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* Conversation history */}
        {conv && conv.threads.length > 0 && (
          <Section title="Conversation history" icon={<MessageSquareText className="size-3.5" />}>
            <ul className="-mx-1 space-y-0.5">
              {conv.threads.map((t) => (
                <li key={t.id}>
                  <button
                    onClick={() => app.setActiveThread(convRef, t.id)}
                    className={cn("flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-hover", t.id === activeId && "bg-active")}
                  >
                    <span className="min-w-0 flex-1">
                      <span className={cn("block truncate text-[13px]", t.unreadCount ? "font-semibold" : "font-medium")}>
                        {t.isGroup && summary?.kind === "person" && <Users className="mr-1 inline size-3 align-[-1px] text-fg-subtle" />}
                        {cleanSubject(t.subject)}
                      </span>
                      <span className="block text-[11px] text-fg-muted">
                        {formatListTime(t.lastMessageAt)} · {t.messageCount} message{t.messageCount === 1 ? "" : "s"}
                        {!t.inInbox && " · archived"}
                      </span>
                    </span>
                    {t.unreadCount > 0 ? (
                      <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-accent-fg">{t.unreadCount}</span>
                    ) : (
                      <Check className="size-3.5 text-fg-subtle" aria-label="Read" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>

      <AttachmentViewer
        attachments={filtered}
        index={viewerIndex}
        onIndexChange={setViewerIndex}
        onClose={() => setViewerIndex(null)}
        onShowInConversation={(a) => {
          setViewerIndex(null);
          app.setActiveThread(convRef, a.threadId, a.messageId);
          app.setMobileView("conversation");
        }}
      />
    </aside>
  );
}

function Section({ title, icon, right, children }: { title: string; icon?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="border-t border-border px-4 py-4">
      <div className="mb-2.5 flex items-center justify-between">
        <h4 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
          {icon}
          {title}
        </h4>
        {right}
      </div>
      {children}
    </section>
  );
}

function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: ReadonlyArray<readonly [T, string]> }) {
  return (
    <div role="radiogroup" className="flex w-full rounded-lg bg-muted p-0.5 text-xs">
      {options.map(([id, label]) => (
        <button
          key={id}
          role="radio"
          aria-checked={value === id}
          onClick={() => onChange(id)}
          className={cn("flex-1 truncate rounded-md px-2 py-1 font-medium transition-colors", value === id ? "bg-panel text-fg shadow-sm" : "text-fg-muted hover:text-fg")}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function PersonRow({ person, isMe, copied, onCopy, onOpen }: { person: Address; isMe: boolean; copied: boolean; onCopy: () => void; onOpen: () => void }) {
  return (
    <div className="group -mx-1 flex items-center gap-2.5 rounded-lg px-1 py-1.5 hover:bg-hover">
      <button onClick={onOpen} disabled={isMe} className="flex min-w-0 flex-1 items-center gap-2.5 text-left disabled:cursor-default" title={isMe ? undefined : `Open conversation with ${displayName(person)}`}>
        <Avatar email={person.email} name={isMe ? "You" : person.name} size="sm" />
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-medium">{isMe ? "You" : displayName(person)}</span>
          <span className="block truncate text-[11px] text-fg-muted">{person.email}</span>
        </span>
      </button>
      <button onClick={onCopy} className="rounded p-1 text-fg-subtle opacity-0 hover:text-fg group-hover:opacity-100 [@media(hover:none)]:opacity-100" aria-label={`Copy ${person.email}`}>
        {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
      </button>
    </div>
  );
}

function GridTile({ file, onOpen }: { file: AttachmentView; onOpen: () => void }) {
  const url = useObjectUrl(file.kind === "image" ? file.previewUrl : null);
  return (
    <button onClick={onOpen} title={`${file.filename} · ${formatBytes(file.size)}`} className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-panel">
      {file.kind === "image" && url ? (
        // eslint-disable-next-line @next/next/no-img-element -- attachment thumbnail
        <img src={url} alt={file.filename} loading="lazy" className="size-full object-cover transition-transform group-hover:scale-105" />
      ) : (
        <span className="flex size-full flex-col items-center justify-center gap-1 p-1.5">
          <FileIcon attachment={file} className="size-9" />
          <span className="w-full truncate text-center text-[10px] text-fg-muted">{file.filename}</span>
        </span>
      )}
    </button>
  );
}
