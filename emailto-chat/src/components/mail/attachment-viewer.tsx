"use client";

import { ChevronLeft, ChevronRight, Download, ExternalLink, FileText, MessageSquareText, X } from "lucide-react";
import { Dialog as D } from "radix-ui";
import * as React from "react";
import { fileExtension, formatBytes } from "@/core/attachments";
import type { AttachmentView } from "@/core/types";
import { cn, formatFullDate } from "@/lib/utils";

/** data: URLs can't always be framed / opened directly → convert to a blob: URL. */
export function useObjectUrl(url: string | null): string | null {
  const [objectUrl, setObjectUrl] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!url || !url.startsWith("data:")) return;
    let revoked = false;
    let created: string | null = null;
    fetch(url)
      .then((r) => r.blob())
      .then((b) => {
        if (revoked) return;
        created = URL.createObjectURL(b);
        setObjectUrl(created);
      })
      .catch(() => {});
    return () => {
      revoked = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [url]);
  if (!url) return null;
  return url.startsWith("data:") ? objectUrl : url;
}

export function FileIcon({ attachment, className }: { attachment: Pick<AttachmentView, "filename" | "mimeType">; className?: string }) {
  const ext = fileExtension(attachment.filename);
  const color =
    ext === "PDF"
      ? "bg-[#fde8e8] text-[#c2410c] dark:bg-[#3b1a12] dark:text-[#fdba8c]"
      : ["XLS", "XLSX", "CSV", "ODS", "NUMBERS"].includes(ext)
        ? "bg-[#e3f6ea] text-[#15803d] dark:bg-[#12301e] dark:text-[#86efac]"
        : ["DOC", "DOCX", "ODT", "PAGES", "TXT", "RTF", "MD"].includes(ext)
          ? "bg-[#e8f0fe] text-[#1d4ed8] dark:bg-[#172340] dark:text-[#9db8ff]"
          : ["PPT", "PPTX", "KEY", "ODP"].includes(ext)
            ? "bg-[#fff1e0] text-[#b45309] dark:bg-[#3a2a12] dark:text-[#f5c27a]"
            : "bg-muted text-fg-muted";
  return (
    <span className={cn("grid shrink-0 place-items-center rounded-lg text-[10px] font-bold tracking-tight", color, className ?? "size-10")}>
      {ext.length <= 4 ? ext : <FileText className="size-4" />}
    </span>
  );
}

export function AttachmentViewer({
  attachments,
  index,
  onIndexChange,
  onClose,
  onShowInConversation,
}: {
  attachments: AttachmentView[];
  index: number | null;
  onIndexChange: (i: number) => void;
  onClose: () => void;
  onShowInConversation?: (a: AttachmentView) => void;
}) {
  const a = index !== null ? attachments[index] : null;
  const preview = useObjectUrl(a?.previewUrl ?? null);
  const download = useObjectUrl(a?.downloadUrl ?? null);

  React.useEffect(() => {
    if (index === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" && index < attachments.length - 1) onIndexChange(index + 1);
      if (e.key === "ArrowLeft" && index > 0) onIndexChange(index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, attachments.length, onIndexChange]);

  return (
    <D.Root open={index !== null} onOpenChange={(o) => !o && onClose()}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/80 animate-fade-in" />
        <D.Content className="fixed inset-0 z-50 flex flex-col text-white outline-none animate-fade-in" aria-describedby={undefined}>
          {a && (
            <>
              <div className="flex items-center gap-3 px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
                <div className="min-w-0 flex-1">
                  <D.Title className="truncate text-sm font-medium">{a.filename}</D.Title>
                  <p className="truncate text-xs text-white/60">
                    {a.fromMe ? "You" : a.senderName} · {formatFullDate(a.date)} · {formatBytes(a.size)}
                  </p>
                </div>
                {onShowInConversation && (
                  <button
                    onClick={() => onShowInConversation(a)}
                    className="hidden items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-white/90 hover:bg-white/10 sm:flex"
                  >
                    <MessageSquareText className="size-4" /> Show in conversation
                  </button>
                )}
                {download && (
                  <a href={download} download={a.filename} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-white/90 hover:bg-white/10">
                    <Download className="size-4" /> <span className="hidden sm:inline">Download</span>
                  </a>
                )}
                <D.Close className="rounded-lg p-2 text-white/80 hover:bg-white/10" aria-label="Close">
                  <X className="size-5" />
                </D.Close>
              </div>
              <div className="relative flex min-h-0 flex-1 items-center justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]" onClick={(e) => e.target === e.currentTarget && onClose()}>
                {a.kind === "image" && preview ? (
                  // eslint-disable-next-line @next/next/no-img-element -- user attachment from an authenticated endpoint / data URL
                  <img src={preview} alt={a.filename} className="max-h-full max-w-full rounded-lg object-contain shadow-2xl" />
                ) : a.mimeType === "application/pdf" && preview ? (
                  <iframe src={preview} title={a.filename} className="h-full w-full max-w-4xl rounded-lg bg-white" sandbox="allow-same-origin allow-scripts allow-downloads" />
                ) : (
                  <div className="flex flex-col items-center gap-4 text-center">
                    <FileIcon attachment={a} className="size-20 text-base" />
                    <div>
                      <p className="font-medium">{a.filename}</p>
                      <p className="text-sm text-white/60">No preview for this file type. Download it to open.</p>
                    </div>
                    {download && (
                      <a href={download} download={a.filename} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-black">
                        <Download className="size-4" /> Download {formatBytes(a.size)}
                      </a>
                    )}
                  </div>
                )}
                {index! > 0 && (
                  <button onClick={() => onIndexChange(index! - 1)} className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-2 hover:bg-black/60" aria-label="Previous file">
                    <ChevronLeft className="size-5" />
                  </button>
                )}
                {index! < attachments.length - 1 && (
                  <button onClick={() => onIndexChange(index! + 1)} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-2 hover:bg-black/60" aria-label="Next file">
                    <ChevronRight className="size-5" />
                  </button>
                )}
              </div>
              {a.previewUrl && !a.previewUrl.startsWith("data:") && (
                <a href={a.previewUrl} target="_blank" rel="noopener noreferrer" className="sr-only focus:not-sr-only">
                  <ExternalLink className="size-4" /> Open in new tab
                </a>
              )}
            </>
          )}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
