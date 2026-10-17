"use client";

import { Bold, ChevronDown, CornerUpLeft, Forward, Italic, List, Paperclip, PenLine, SendHorizontal, Smile, Type, X } from "lucide-react";
import { Popover } from "radix-ui";
import * as React from "react";
import { displayName } from "@/core/addresses";
import { formatBytes } from "@/core/attachments";
import { cleanSubject } from "@/core/grouping";
import { forwardSubject, replyRecipients } from "@/core/mime";
import type { Address, ComposeMode, MessageView, SendResult, ThreadDetail } from "@/core/types";
import { cn, formatFullDate, safeLocalStorage, uid } from "@/lib/utils";
import { FileIcon } from "./attachment-viewer";
import { useMail } from "./mail-context";
import { RecipientsField } from "./recipients-field";
import { useSendQueue, useToast } from "./send-queue";

export type ComposerContext =
  | { kind: "thread"; thread: ThreadDetail; intent: { kind: "reply" | "replyAll" | "forward"; message: MessageView } | null }
  | { kind: "newTopic"; recipients: Address[]; title: string }
  | { kind: "newMessage"; initialTo: Address[] };

interface DraftState {
  to: Address[];
  cc: Address[];
  bcc: Address[];
  subject: string;
  text: string;
  draftId: string | null;
}

const MAX_ATTACH_MB = 25;
const EMOJIS = "😀 😂 😊 😍 🤔 😅 🙌 👍 👎 👏 🙏 💪 🎉 🔥 ✨ ❤️ 💙 ✅ ❌ ⚠️ 📎 📅 ☕ 🍜 🚀 💡 📌 👀 😉 😎 🤝 🥳".split(" ");

export function Composer({
  context,
  draftKey,
  onSent,
  onCancel,
  autoFocus,
}: {
  context: ComposerContext;
  /** Unique per thread / new-topic target; used for local draft autosave. */
  draftKey: string;
  onSent?: (result: SendResult, mode: ComposeMode, to: Address[]) => void;
  onCancel?: () => void;
  autoFocus?: boolean;
}) {
  const { client, self, prefs, account, online } = useMail();
  const queue = useSendQueue();
  const toast = useToast();
  const storage = safeLocalStorage();
  const storageKey = `etc:draft:${client.mode}:${draftKey}`;

  const intent = context.kind === "thread" ? context.intent : null;
  const mode: ComposeMode =
    context.kind === "newTopic" ? "newTopic" : context.kind === "newMessage" ? "new" : intent?.kind === "forward" ? "forward" : intent?.kind === "replyAll" ? "replyAll" : intent?.kind === "reply" ? "reply" : context.thread.thread.isGroup ? "replyAll" : "reply";

  const replyTarget = React.useMemo<MessageView | null>(() => {
    if (context.kind !== "thread") return null;
    if (intent) return intent.message;
    const msgs = context.thread.messages;
    return msgs[msgs.length - 1] ?? null;
  }, [context, intent]);

  const defaults = React.useMemo<Pick<DraftState, "to" | "cc" | "bcc" | "subject">>(() => {
    if (context.kind === "newTopic") return { to: context.recipients, cc: [], bcc: [], subject: "" };
    if (context.kind === "newMessage") return { to: context.initialTo, cc: [], bcc: [], subject: "" };
    if (mode === "forward") return { to: [], cc: [], bcc: [], subject: forwardSubject(replyTarget?.subject ?? context.thread.thread.subject) };
    if (!replyTarget) return { to: context.thread.thread.participants, cc: [], bcc: [], subject: context.thread.thread.subject };
    const r = replyRecipients(replyTarget, self.addresses, mode === "replyAll");
    return { ...r, bcc: [], subject: context.thread.thread.subject };
  }, [context, mode, replyTarget, self]);

  const [state, setState] = React.useState<DraftState>(() => {
    try {
      const raw = storage?.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<DraftState> & { touched?: boolean };
        if (saved.text || saved.subject) {
          return { ...defaults, draftId: null, text: "", ...(saved.touched ? saved : { text: saved.text ?? "", subject: saved.subject || defaults.subject, draftId: saved.draftId ?? null }) } as DraftState;
        }
      }
    } catch {
      /* ignore */
    }
    return { ...defaults, text: "", draftId: null };
  });
  const [touchedRecipients, setTouchedRecipients] = React.useState(false);
  const [files, setFiles] = React.useState<File[]>([]);
  const [showRecipientsState, setShowRecipients] = React.useState(context.kind !== "thread");
  const showRecipients = showRecipientsState || intent?.kind === "forward";
  const [showCc, setShowCc] = React.useState(false);
  const [showFormat, setShowFormat] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const idempotencyKey = React.useRef(uid("send_"));
  const textRef = React.useRef<HTMLTextAreaElement>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  // Re-derive recipients when the reply target changes, unless the user edited them.
  React.useEffect(() => {
    if (touchedRecipients) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- recipients follow the reply target until edited
    setState((s) => ({ ...s, to: defaults.to, cc: defaults.cc, bcc: s.bcc, subject: mode === "newTopic" || mode === "new" ? s.subject : defaults.subject }));
  }, [defaults, touchedRecipients, mode]);

  React.useEffect(() => {
    if (intent) textRef.current?.focus();
  }, [intent]);

  React.useEffect(() => {
    if (autoFocus) textRef.current?.focus();
  }, [autoFocus]);

  // Local autosave (instant) …
  React.useEffect(() => {
    const id = window.setTimeout(() => {
      try {
        if (state.text.trim() || (mode === "newTopic" && state.subject.trim())) storage?.setItem(storageKey, JSON.stringify({ ...state, touched: touchedRecipients }));
        else storage?.removeItem(storageKey);
      } catch {
        /* quota */
      }
    }, 300);
    return () => window.clearTimeout(id);
  }, [state, storageKey, storage, mode, touchedRecipients]);

  // … and a Gmail draft (debounced) so the draft is also visible in Gmail.
  const draftSaving = React.useRef(false);
  React.useEffect(() => {
    if (!state.text.trim() || !online) return;
    const id = window.setTimeout(async () => {
      if (draftSaving.current) return;
      draftSaving.current = true;
      try {
        const res = await client.saveDraft({
          draftId: state.draftId,
          threadId: context.kind === "thread" && mode !== "forward" ? context.thread.thread.id : null,
          inReplyToMessageId: replyTarget && mode !== "forward" ? replyTarget.id : null,
          to: state.to,
          cc: state.cc,
          bcc: state.bcc,
          subject: state.subject,
          text: state.text,
        });
        setState((s) => (s.draftId === res.draftId ? s : { ...s, draftId: res.draftId }));
      } catch {
        /* drafts are best-effort; local autosave still holds the text */
      } finally {
        draftSaving.current = false;
      }
    }, 4000);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- save on content changes only
  }, [state.text, state.subject, state.to, state.cc, state.bcc]);

  // Auto-grow the textarea.
  React.useLayoutEffect(() => {
    const el = textRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [state.text]);

  const allRecipients = [...state.to, ...state.cc, ...state.bcc];
  const totalSize = files.reduce((s, f) => s + f.size, 0);
  const canSend = (state.text.trim().length > 0 || files.length > 0) && allRecipients.length > 0 && !sending;

  const setRecipients = (patch: Partial<Pick<DraftState, "to" | "cc" | "bcc">>) => {
    setTouchedRecipients(true);
    setState((s) => ({ ...s, ...patch }));
  };

  const send = async () => {
    if (!canSend) {
      if (!allRecipients.length) {
        setShowRecipients(true);
        toast({ message: "Add at least one recipient.", tone: "error" });
      }
      return;
    }
    if ((mode === "newTopic" || mode === "new") && !state.subject.trim()) {
      toast({ message: "Give this new topic a subject.", tone: "error" });
      document.getElementById(`${storageKey}-subject`)?.focus();
      return;
    }
    if (totalSize > MAX_ATTACH_MB * 1024 * 1024) {
      toast({ message: `Attachments exceed ${MAX_ATTACH_MB} MB.`, tone: "error" });
      return;
    }
    setSending(true);
    const forwardBlock =
      mode === "forward" && replyTarget
        ? `\n\n---------- Forwarded message ---------\nFrom: ${displayName(replyTarget.from)} <${replyTarget.from.email}>\nDate: ${formatFullDate(replyTarget.date)}\nSubject: ${replyTarget.subject}\nTo: ${replyTarget.to.map((a) => a.email).join(", ")}\n\n${[replyTarget.body.text, replyTarget.body.signature].filter(Boolean).join("\n\n")}`
        : "";
    const input = {
      idempotencyKey: idempotencyKey.current,
      mode,
      threadId: context.kind === "thread" && mode !== "forward" ? context.thread.thread.id : null,
      inReplyToMessageId: replyTarget ? replyTarget.id : null,
      to: state.to,
      cc: state.cc,
      bcc: state.bcc,
      subject: state.subject,
      text: state.text.trim() + forwardBlock,
      attachments: files.map((f) => ({ filename: f.name, mimeType: f.type || "application/octet-stream", data: f as Blob })),
      draftId: state.draftId,
    };
    // Clear the composer right away (optimistic). The queue keeps the input for retries.
    const sentTo = state.to;
    setState({ ...defaults, to: defaults.to, text: "", subject: mode === "newTopic" || mode === "new" ? "" : defaults.subject, draftId: null });
    setFiles([]);
    setTouchedRecipients(false);
    storage?.removeItem(storageKey);
    idempotencyKey.current = uid("send_");
    const result = await queue.send(input);
    setSending(false);
    if (result) {
      if (mode === "forward") toast({ message: `Forwarded to ${sentTo.map((a) => displayName(a)).join(", ")}`, tone: "success" });
      onSent?.(result, mode, sentTo);
    } else if (mode === "newTopic" || mode === "new" || mode === "forward") {
      // Not shown in a timeline yet → restore the text so nothing is lost.
      setState((s) => ({ ...s, text: input.text, subject: input.subject, to: input.to, cc: input.cc, bcc: input.bcc }));
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
    const modifier = e.metaKey || e.ctrlKey;
    // Enter-to-send: Enter sends, Shift+Enter = new line. Otherwise Ctrl/⌘+Enter sends.
    if (modifier || (prefs.enterToSend && !e.shiftKey)) {
      e.preventDefault();
      void send();
    }
  };

  const wrapSelection = (before: string, after = before) => {
    const el = textRef.current;
    if (!el) return;
    const { selectionStart: a, selectionEnd: b, value } = el;
    const selected = value.slice(a, b) || "text";
    const next = value.slice(0, a) + before + selected + after + value.slice(b);
    setState((s) => ({ ...s, text: next }));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(a + before.length, a + before.length + selected.length);
    });
  };
  const insertAtCursor = (str: string) => {
    const el = textRef.current;
    const value = state.text;
    const a = el?.selectionStart ?? value.length;
    const b = el?.selectionEnd ?? value.length;
    setState((s) => ({ ...s, text: value.slice(0, a) + str + value.slice(b) }));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(a + str.length, a + str.length);
    });
  };

  const addFiles = (list: FileList | File[] | null) => {
    if (!list) return;
    const arr = Array.from(list);
    if (!arr.length) return;
    setFiles((f) => [...f, ...arr]);
  };

  const recipientSummary = state.to.length
    ? state.to.map((a) => displayName(a)).join(", ") + (state.cc.length ? ` · cc ${state.cc.map((a) => displayName(a).split(" ")[0]).join(", ")}` : "") + (state.bcc.length ? ` · bcc ${state.bcc.length}` : "")
    : "Add recipients";

  const intentLabel =
    mode === "forward" ? (
      <>
        <Forward className="size-3.5" /> Forwarding “{cleanSubject(replyTarget?.subject)}”
      </>
    ) : intent ? (
      <>
        <CornerUpLeft className="size-3.5" /> {intent.kind === "replyAll" ? "Reply all to" : "Replying to"} {replyTarget?.fromMe ? "your message" : displayName(replyTarget?.from)}: “{(replyTarget?.body.text ?? replyTarget?.snippet ?? "").slice(0, 60)}”
      </>
    ) : context.kind === "newTopic" ? (
      <>
        <PenLine className="size-3.5" /> New topic with {context.title} — starts a separate e-mail thread
      </>
    ) : null;

  return (
    <div
      className="border-t border-border bg-bg/95 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur md:px-5"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) e.preventDefault();
      }}
      onDrop={(e) => {
        if (e.dataTransfer.files.length) {
          e.preventDefault();
          addFiles(e.dataTransfer.files);
        }
      }}
    >
      {intentLabel && (
        <div className="mb-1.5 flex items-center justify-between gap-2 rounded-lg bg-subtle px-2.5 py-1.5 text-xs text-fg-muted">
          <span className="flex min-w-0 items-center gap-1.5 truncate">{intentLabel}</span>
          {(intent || onCancel) && (
            <button onClick={() => onCancel?.()} className="shrink-0 rounded p-0.5 hover:bg-hover hover:text-fg" aria-label="Cancel">
              <X className="size-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Recipients — always clear who receives this e-mail. */}
      {showRecipients ? (
        <div className="mb-1 rounded-xl border border-border bg-panel px-3 py-1">
          <div className="flex items-start">
            <div className="flex-1">
              <RecipientsField label="To" value={state.to} onChange={(to) => setRecipients({ to })} autoFocus={context.kind === "newMessage" && !state.to.length} />
            </div>
            {!showCc && (
              <button onClick={() => setShowCc(true)} className="mt-2 shrink-0 rounded px-1.5 text-xs font-medium text-fg-muted hover:text-fg">
                Cc Bcc
              </button>
            )}
          </div>
          {(showCc || state.cc.length > 0 || state.bcc.length > 0) && (
            <>
              <RecipientsField label="Cc" value={state.cc} onChange={(cc) => setRecipients({ cc })} />
              <RecipientsField label="Bcc" value={state.bcc} onChange={(bcc) => setRecipients({ bcc })} />
            </>
          )}
          {(mode === "newTopic" || mode === "new" || mode === "forward") && (
            <div className="flex items-center gap-2 border-t border-border py-1">
              <label htmlFor={`${storageKey}-subject`} className="w-8 shrink-0 text-[13px] text-fg-subtle">
                Subj.
              </label>
              <input
                id={`${storageKey}-subject`}
                value={state.subject}
                onChange={(e) => setState((s) => ({ ...s, subject: e.target.value }))}
                placeholder="Subject"
                className="h-8 flex-1 bg-transparent text-[16px] font-medium outline-none placeholder:font-normal placeholder:text-fg-subtle md:text-[14px]"
                autoFocus={mode === "newTopic"}
              />
            </div>
          )}
          {context.kind === "thread" && (
            <button onClick={() => setShowRecipients(false)} className="mb-1 text-[11px] text-fg-subtle hover:text-fg">
              Hide recipients
            </button>
          )}
        </div>
      ) : (
        <button onClick={() => setShowRecipients(true)} className="mb-1 flex max-w-full items-center gap-1 rounded-md px-1 text-left text-xs text-fg-muted hover:text-fg" title="Edit recipients (To / Cc / Bcc)">
          <span className="text-fg-subtle">To:</span>
          <span className="truncate font-medium">{recipientSummary}</span>
          <ChevronDown className="size-3 shrink-0" />
        </button>
      )}

      {files.length > 0 && (
        <div className="mb-1.5 flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {files.map((f, i) => (
            <div key={`${f.name}-${i}`} className="flex shrink-0 items-center gap-2 rounded-xl border border-border bg-panel py-1.5 pl-1.5 pr-2">
              <FileIcon attachment={{ filename: f.name, mimeType: f.type }} className="size-8" />
              <div className="max-w-[160px]">
                <p className="truncate text-xs font-medium">{f.name}</p>
                <p className="text-[11px] text-fg-muted">{formatBytes(f.size)}</p>
              </div>
              <button onClick={() => setFiles((list) => list.filter((_, j) => j !== i))} className="rounded p-0.5 text-fg-subtle hover:text-fg" aria-label={`Remove ${f.name}`}>
                <X className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {showFormat && (
        <div className="mb-1 flex items-center gap-0.5">
          <FormatButton label="Bold (**text**)" onClick={() => wrapSelection("**")}>
            <Bold />
          </FormatButton>
          <FormatButton label="Italic (_text_)" onClick={() => wrapSelection("_")}>
            <Italic />
          </FormatButton>
          <FormatButton label="Bulleted list" onClick={() => insertAtCursor((state.text && !state.text.endsWith("\n") ? "\n" : "") + "- ")}>
            <List />
          </FormatButton>
          <span className="ml-2 text-[11px] text-fg-subtle">Sent as formatted e-mail with a plain-text version.</span>
        </div>
      )}

      <div className="flex items-end gap-1">
        <div className="flex items-center pb-0.5">
          <ComposerIcon label="Attach files" onClick={() => fileRef.current?.click()}>
            <Paperclip />
          </ComposerIcon>
          <input ref={fileRef} type="file" multiple hidden onChange={(e) => (addFiles(e.target.files), (e.target.value = ""))} />
          <ComposerIcon label="Formatting" onClick={() => setShowFormat((v) => !v)} active={showFormat} className="hidden sm:inline-flex">
            <Type />
          </ComposerIcon>
        </div>
        <div className="relative flex min-w-0 flex-1 items-end rounded-[22px] bg-muted pr-1 focus-within:bg-panel focus-within:ring-1 focus-within:ring-border-strong">
          <textarea
            ref={textRef}
            rows={1}
            value={state.text}
            onChange={(e) => setState((s) => ({ ...s, text: e.target.value }))}
            onKeyDown={onKeyDown}
            onPaste={(e) => {
              if (e.clipboardData.files.length) {
                e.preventDefault();
                addFiles(e.clipboardData.files);
              }
            }}
            placeholder="Write a message..."
            aria-label="Message"
            className="max-h-[220px] min-h-[40px] flex-1 resize-none bg-transparent py-2.5 pl-4 pr-1 text-[16px] leading-[1.35] outline-none placeholder:text-fg-subtle md:text-[15px]"
          />
          <EmojiPicker onPick={insertAtCursor} />
        </div>
        <button
          onClick={() => void send()}
          disabled={!canSend}
          aria-label="Send"
          title={prefs.enterToSend ? "Send (Enter)" : "Send (Ctrl/⌘ + Enter)"}
          className={cn(
            "mb-0.5 grid size-10 shrink-0 place-items-center rounded-full transition-all",
            canSend ? "bg-accent text-accent-fg shadow-sm hover:bg-accent-hover active:scale-95" : "text-fg-subtle",
          )}
        >
          <SendHorizontal className="size-5" />
        </button>
      </div>
      {!online && <p className="mt-1 px-1 text-[11px] text-warning">You’re offline. Messages can’t be sent until the connection is back.</p>}
      {account && client.mode === "demo" && <p className="mt-1 px-1 text-[11px] text-fg-subtle">Demo Mode: messages are simulated locally and never sent.</p>}
    </div>
  );
}

function ComposerIcon({ label, onClick, children, active, className }: { label: string; onClick: () => void; children: React.ReactNode; active?: boolean; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={cn("inline-flex size-9 items-center justify-center rounded-full text-accent transition-colors hover:bg-hover [&_svg]:size-5", active && "bg-active", className)}
    >
      {children}
    </button>
  );
}

function FormatButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className="inline-flex size-7 items-center justify-center rounded-md text-fg-muted hover:bg-hover hover:text-fg [&_svg]:size-3.5">
      {children}
    </button>
  );
}

function EmojiPicker({ onPick }: { onPick: (e: string) => void }) {
  const [open, setOpen] = React.useState(false);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button type="button" aria-label="Emoji" title="Emoji" className="mb-1 inline-flex size-8 shrink-0 items-center justify-center rounded-full text-fg-muted hover:bg-hover hover:text-accent">
          <Smile className="size-5" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content side="top" align="end" sideOffset={8} className="z-50 grid w-[264px] grid-cols-8 gap-0.5 rounded-xl border border-border bg-panel p-2 shadow-lg animate-pop">
          {EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => {
                onPick(e);
                setOpen(false);
              }}
              className="grid size-8 place-items-center rounded-lg text-xl hover:bg-hover"
            >
              {e}
            </button>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
