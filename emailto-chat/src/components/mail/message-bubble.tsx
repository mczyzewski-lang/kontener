"use client";

import {
  Copy,
  CornerUpLeft,
  CornerUpRight,
  FileCode2,
  Forward,
  Loader2,
  Mail,
  MoreHorizontal,
  RotateCcw,
  Star,
  StarOff,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import * as React from "react";
import { displayName, formatAddress } from "@/core/addresses";
import { formatBytes } from "@/core/attachments";
import type { AttachmentView, MessageView } from "@/core/types";
import { Avatar, senderColorClass } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown";
import { cn, formatFullDate, formatTime } from "@/lib/utils";
import { FileIcon, useObjectUrl } from "./attachment-viewer";
import { HtmlFrame } from "./html-frame";

export interface BubbleActions {
  onReply: (m: MessageView) => void;
  onReplyAll: (m: MessageView) => void;
  onForward: (m: MessageView) => void;
  onToggleStar: (m: MessageView) => void;
  onMarkUnread: (m: MessageView) => void;
  onShowOriginal: (m: MessageView) => void;
  onOpenAttachment: (a: AttachmentView) => void;
  onCopied: () => void;
}

const LONG_CHARS = 700;
const LONG_LINES = 14;

export function MessageBubble({
  message,
  isGroup,
  firstInRun,
  lastInRun,
  showRecipients,
  highlighted,
  alwaysLoadImages,
  actions,
  pendingState,
  onRetry,
  onDiscard,
}: {
  message: MessageView;
  isGroup: boolean;
  firstInRun: boolean;
  lastInRun: boolean;
  showRecipients: boolean;
  highlighted?: boolean;
  alwaysLoadImages: boolean;
  actions: BubbleActions;
  pendingState?: "sending" | "failed";
  onRetry?: () => void;
  onDiscard?: () => void;
}) {
  const m = message;
  const mine = m.fromMe;
  const [expanded, setExpanded] = React.useState(false);
  const [showQuoted, setShowQuoted] = React.useState(false);
  const [showSignature, setShowSignature] = React.useState(false);
  const [showHtml, setShowHtml] = React.useState(m.body.preferHtml);
  const [showHeaders, setShowHeaders] = React.useState(false);

  const text = m.body.text ?? "";
  const isLong = text.length > LONG_CHARS || text.split("\n").length > LONG_LINES;
  const isCard = showHtml && !!m.body.html;
  const wide = isCard || isLong;
  const images = m.attachments.filter((a) => a.kind === "image");
  const files = m.attachments.filter((a) => a.kind !== "image");
  const recipients = [...m.to, ...m.cc];

  return (
    <div
      id={`msg-${m.id}`}
      className={cn(
        "group/msg relative flex gap-2 px-3 md:px-6",
        mine ? "flex-row-reverse" : "flex-row",
        firstInRun ? "mt-3" : "mt-0.5",
        highlighted && "animate-pop",
      )}
    >
      {!mine && (
        <div className="w-8 shrink-0 self-end">{lastInRun && <Avatar email={m.from.email} name={m.from.name} size="sm" />}</div>
      )}

      <div className={cn("flex min-w-0 flex-col", mine ? "items-end" : "items-start", wide ? "w-full max-w-[min(100%,720px)]" : "max-w-[min(85%,560px)]")}>
        {firstInRun && !mine && isGroup && (
          <span className={cn("mb-0.5 ml-3 text-xs font-medium", senderColorClass(m.from.email))}>{displayName(m.from)}</span>
        )}

        <div className={cn("relative flex max-w-full items-center gap-1", mine ? "flex-row-reverse" : "flex-row", wide && "w-full")}>
          <div
            className={cn(
              "relative min-w-0 max-w-full transition-shadow",
              wide && "w-full",
              isCard
                ? "rounded-2xl"
                : cn(
                    "rounded-[20px] px-3.5 py-2",
                    mine ? "bg-bubble-out text-bubble-out-fg" : "bg-bubble-in text-bubble-in-fg",
                    mine ? (lastInRun ? "rounded-br-md" : "rounded-r-md") : lastInRun ? "rounded-bl-md" : "rounded-l-md",
                    mine && firstInRun && "rounded-tr-[20px]",
                    !mine && firstInRun && "rounded-tl-[20px]",
                  ),
              highlighted && "ring-2 ring-accent ring-offset-2 ring-offset-bg",
              pendingState === "sending" && "opacity-70",
              pendingState === "failed" && "ring-2 ring-danger/60",
            )}
          >
            {isCard ? (
              <HtmlFrame html={m.body.html!} hasRemoteImages={m.body.hasRemoteImages} alwaysLoadImages={alwaysLoadImages} />
            ) : (
              <>
                {text ? (
                  <div className={cn("relative", isLong && !expanded && "max-h-[22rem] overflow-hidden")}>
                    <RichText text={text} mine={mine} />
                    {isLong && !expanded && (
                      <div className={cn("pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t", mine ? "from-bubble-out" : "from-bubble-in")} />
                    )}
                  </div>
                ) : (
                  !m.attachments.length && <p className="text-[15px] italic opacity-70">(empty message)</p>
                )}
                {isLong && (
                  <button onClick={() => setExpanded((v) => !v)} className={cn("mt-1 text-[13px] font-medium underline-offset-2 hover:underline", mine ? "text-white/90" : "text-accent")}>
                    {expanded ? "Show less" : "Read more"}
                  </button>
                )}
                {m.body.signature && (
                  <Collapsible
                    open={showSignature}
                    onToggle={() => setShowSignature((v) => !v)}
                    label={showSignature ? "Hide signature" : "Signature"}
                    mine={mine}
                    content={m.body.signature}
                  />
                )}
                {m.body.quotedText && (
                  <Collapsible
                    open={showQuoted}
                    onToggle={() => setShowQuoted((v) => !v)}
                    label={showQuoted ? "Hide quoted text" : "•••"}
                    mine={mine}
                    content={m.body.quotedText}
                    quote
                  />
                )}
              </>
            )}

            {images.length > 0 && (
              <div className={cn("grid gap-1", !isCard && (text ? "mt-2" : ""), images.length === 1 ? "grid-cols-1" : "grid-cols-2", isCard && "mt-2")}>
                {images.slice(0, 4).map((a, i) => (
                  <ImageThumb key={a.id} attachment={a} more={i === 3 && images.length > 4 ? images.length - 4 : 0} onOpen={() => actions.onOpenAttachment(a)} single={images.length === 1} />
                ))}
              </div>
            )}
            {files.length > 0 && (
              <div className={cn("flex flex-col gap-1.5", (text || images.length) && "mt-2")}>
                {files.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => actions.onOpenAttachment(a)}
                    className={cn(
                      "flex w-full min-w-[220px] items-center gap-2.5 rounded-xl p-2 text-left transition-colors",
                      mine && !isCard ? "bg-white/15 hover:bg-white/25" : "border border-border bg-panel hover:bg-hover",
                    )}
                  >
                    <FileIcon attachment={a} className="size-9" />
                    <span className="min-w-0 flex-1">
                      <span className={cn("block truncate text-[13px] font-medium", mine && !isCard ? "text-white" : "text-fg")}>{a.filename}</span>
                      <span className={cn("block text-[11px]", mine && !isCard ? "text-white/75" : "text-fg-muted")}>{formatBytes(a.size)}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {!pendingState && <MessageMenu message={m} actions={actions} mine={mine} onShowHtml={m.body.html && !m.body.preferHtml ? () => setShowHtml((v) => !v) : undefined} showingHtml={showHtml} />}
        </div>

        {(lastInRun || pendingState || showRecipients || m.starred) && (
          <div className={cn("mt-1 flex items-center gap-1.5 px-1 text-[11px] text-fg-subtle", mine ? "flex-row-reverse" : "flex-row")}>
            {pendingState === "sending" ? (
              <span className="flex items-center gap-1">
                <Loader2 className="size-3 animate-spin" /> Sending…
              </span>
            ) : pendingState === "failed" ? (
              <span className="flex items-center gap-2 text-danger">
                <TriangleAlert className="size-3" /> Not sent
                <button onClick={onRetry} className="flex items-center gap-1 font-medium underline-offset-2 hover:underline">
                  <RotateCcw className="size-3" /> Retry
                </button>
                <button onClick={onDiscard} className="flex items-center gap-1 text-fg-muted underline-offset-2 hover:underline">
                  <Trash2 className="size-3" /> Discard
                </button>
              </span>
            ) : (
              <time dateTime={m.date} title={formatFullDate(m.date)}>
                {formatTime(m.date)}
              </time>
            )}
            {m.starred && <Star className="size-3 fill-warning text-warning" aria-label="Starred" />}
            {showRecipients && recipients.length > 0 && !pendingState && (
              <button onClick={() => setShowHeaders((v) => !v)} className="max-w-[18rem] truncate hover:text-fg-muted" title="Show recipients">
                · to {m.to.map((a) => (a.email && mine ? displayName(a) : displayName(a).split(" ")[0])).join(", ")}
                {m.cc.length > 0 && ` · cc ${m.cc.map((a) => displayName(a).split(" ")[0]).join(", ")}`}
              </button>
            )}
          </div>
        )}
        {showHeaders && (
          <dl className="mt-1 grid max-w-full grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 rounded-lg bg-subtle px-3 py-2 text-[11px] text-fg-muted">
            <dt className="text-fg-subtle">From</dt>
            <dd className="break-all">{formatAddress(m.from)}</dd>
            {m.to.length > 0 && (
              <>
                <dt className="text-fg-subtle">To</dt>
                <dd className="break-all">{m.to.map(formatAddress).join(", ")}</dd>
              </>
            )}
            {m.cc.length > 0 && (
              <>
                <dt className="text-fg-subtle">Cc</dt>
                <dd className="break-all">{m.cc.map(formatAddress).join(", ")}</dd>
              </>
            )}
            {m.bcc.length > 0 && (
              <>
                <dt className="text-fg-subtle">Bcc</dt>
                <dd className="break-all">{m.bcc.map(formatAddress).join(", ")}</dd>
              </>
            )}
            <dt className="text-fg-subtle">Date</dt>
            <dd>{formatFullDate(m.date)}</dd>
            <dt className="text-fg-subtle">Subject</dt>
            <dd>{m.subject}</dd>
          </dl>
        )}
      </div>
    </div>
  );
}

function Collapsible({ open, onToggle, label, content, mine, quote }: { open: boolean; onToggle: () => void; label: string; content: string; mine: boolean; quote?: boolean }) {
  return (
    <div className="mt-1">
      <button
        onClick={onToggle}
        aria-expanded={open}
        className={cn(
          "rounded-full px-2 py-0 text-[12px] font-medium leading-5 transition-colors",
          mine ? "bg-white/15 text-white/90 hover:bg-white/25" : "bg-black/5 text-fg-muted hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/15",
        )}
        title={quote ? "Show quoted text" : "Show signature"}
      >
        {label}
      </button>
      {open && (
        <div className={cn("mt-1.5 whitespace-pre-wrap break-words text-[13px] leading-relaxed", quote && "border-l-2 pl-2.5", mine ? "border-white/40 text-white/85" : "border-border-strong text-fg-muted")}>
          {content}
        </div>
      )}
    </div>
  );
}

const URL_RE = /(https?:\/\/[^\s<>"')\]]+[^\s<>"')\].,;:!?])|([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;

export function RichText({ text, mine }: { text: string; mine: boolean }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_RE)) {
    const i = match.index ?? 0;
    if (i > last) parts.push(text.slice(last, i));
    const value = match[0];
    const href = match[1] ? value : `mailto:${value}`;
    parts.push(
      <a key={i} href={href} target="_blank" rel="noopener noreferrer nofollow" className={cn("underline underline-offset-2", mine ? "text-white decoration-white/50" : "text-accent decoration-accent/40")}>
        {value}
      </a>,
    );
    last = i + value.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <p className="whitespace-pre-wrap break-words text-[15px] leading-[1.45]">{parts}</p>;
}

function ImageThumb({ attachment, onOpen, more, single }: { attachment: AttachmentView; onOpen: () => void; more: number; single: boolean }) {
  const url = useObjectUrl(attachment.previewUrl);
  return (
    <button onClick={onOpen} className={cn("relative overflow-hidden rounded-xl bg-muted", single ? "aspect-[3/2] w-[min(100%,340px)]" : "aspect-square w-full min-w-[110px]")} aria-label={`Open ${attachment.filename}`}>
      {url && (
        // eslint-disable-next-line @next/next/no-img-element -- attachment preview
        <img src={url} alt={attachment.filename} loading="lazy" className="size-full object-cover transition-transform duration-300 hover:scale-[1.03]" />
      )}
      {more > 0 && <span className="absolute inset-0 grid place-items-center bg-black/50 text-lg font-semibold text-white">+{more}</span>}
    </button>
  );
}

function MessageMenu({
  message,
  actions,
  mine,
  onShowHtml,
  showingHtml,
}: {
  message: MessageView;
  actions: BubbleActions;
  mine: boolean;
  onShowHtml?: () => void;
  showingHtml: boolean;
}) {
  const copy = async () => {
    const text = [message.body.text, message.body.signature].filter(Boolean).join("\n\n") || message.snippet;
    try {
      await navigator.clipboard.writeText(text);
      actions.onCopied();
    } catch {
      /* clipboard blocked */
    }
  };
  return (
    <div className={cn("flex shrink-0 items-center gap-0.5 self-center opacity-0 transition-opacity focus-within:opacity-100 group-hover/msg:opacity-100 [@media(hover:none)]:opacity-100", mine ? "mr-1" : "ml-1")}>
      <button onClick={() => actions.onReply(message)} className="rounded-full p-1.5 text-fg-subtle hover:bg-hover hover:text-fg [@media(hover:none)]:hidden" aria-label="Reply">
        <CornerUpLeft className="size-4" />
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="rounded-full p-1.5 text-fg-subtle hover:bg-hover hover:text-fg data-[state=open]:bg-hover" aria-label="Message actions">
            <MoreHorizontal className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={mine ? "end" : "start"}>
          <DropdownMenuItem icon={<CornerUpLeft />} onSelect={() => actions.onReply(message)}>
            Reply
          </DropdownMenuItem>
          <DropdownMenuItem icon={<CornerUpRight />} onSelect={() => actions.onReplyAll(message)}>
            Reply all
          </DropdownMenuItem>
          <DropdownMenuItem icon={<Forward />} onSelect={() => actions.onForward(message)}>
            Forward
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem icon={<Copy />} onSelect={() => void copy()}>
            Copy text
          </DropdownMenuItem>
          {!mine && (
            <DropdownMenuItem icon={<Mail />} onSelect={() => actions.onMarkUnread(message)}>
              Mark unread
            </DropdownMenuItem>
          )}
          <DropdownMenuItem icon={message.starred ? <StarOff /> : <Star />} onSelect={() => actions.onToggleStar(message)}>
            {message.starred ? "Remove star" : "Star"}
          </DropdownMenuItem>
          {onShowHtml && (
            <DropdownMenuItem icon={<Mail />} onSelect={onShowHtml}>
              {showingHtml ? "Show as chat text" : "Show formatted e-mail"}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem icon={<FileCode2 />} onSelect={() => actions.onShowOriginal(message)}>
            Show original
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
