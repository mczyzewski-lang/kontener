"use client";

import { CheckCircle2, Info, TriangleAlert, X } from "lucide-react";
import * as React from "react";
import { useSWRConfig } from "swr";
import { MailClientError } from "@/core/client";
import type { MessageView, SendInput, SendResult } from "@/core/types";
import { useMail } from "./mail-context";

// ── Toasts ─────────────────────────────────────────────────────────────────────

interface Toast {
  id: number;
  message: string;
  tone: "info" | "success" | "error";
  action?: { label: string; onClick: () => void };
}

const ToastCtx = React.createContext<(t: Omit<Toast, "id">) => void>(() => {});
export const useToast = () => React.useContext(ToastCtx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const show = React.useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((list) => [...list.slice(-2), { ...t, id }]);
    window.setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), t.action ? 6000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto flex max-w-md items-center gap-3 rounded-xl bg-fg px-4 py-2.5 text-sm text-bg shadow-lg animate-slide-up">
            {t.tone === "success" ? <CheckCircle2 className="size-4 text-success" /> : t.tone === "error" ? <TriangleAlert className="size-4 text-danger" /> : <Info className="size-4 opacity-70" />}
            <span className="flex-1">{t.message}</span>
            {t.action && (
              <button
                onClick={() => {
                  t.action!.onClick();
                  setToasts((list) => list.filter((x) => x.id !== t.id));
                }}
                className="font-semibold text-accent"
              >
                {t.action.label}
              </button>
            )}
            <button onClick={() => setToasts((list) => list.filter((x) => x.id !== t.id))} aria-label="Dismiss" className="opacity-60 hover:opacity-100">
              <X className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// ── Outgoing queue (optimistic bubbles, retry with the same idempotency key) ───

export interface PendingSend {
  key: string;
  threadId: string | null;
  input: SendInput;
  status: "sending" | "failed";
  error?: string;
  createdAt: number;
}

interface SendQueue {
  pending: PendingSend[];
  send: (input: SendInput) => Promise<SendResult | null>;
  retry: (key: string) => Promise<SendResult | null>;
  discard: (key: string) => void;
}

const SendCtx = React.createContext<SendQueue | null>(null);

export function useSendQueue(): SendQueue {
  const v = React.useContext(SendCtx);
  if (!v) throw new Error("useSendQueue outside provider");
  return v;
}

export function SendQueueProvider({ children }: { children: React.ReactNode }) {
  const { client, refreshAll } = useMail();
  const { mutate } = useSWRConfig();
  const toast = useToast();
  const [pending, setPending] = React.useState<PendingSend[]>([]);
  const inFlight = React.useRef(new Set<string>());

  const run = React.useCallback(
    async (input: SendInput): Promise<SendResult | null> => {
      const key = input.idempotencyKey;
      // Guard against double submits (double click, Enter + click, retry while sending).
      if (inFlight.current.has(key)) return null;
      inFlight.current.add(key);
      setPending((list) => {
        const existing = list.find((p) => p.key === key);
        if (existing) return list.map((p) => (p.key === key ? { ...p, status: "sending", error: undefined } : p));
        return [...list, { key, threadId: input.threadId ?? null, input, status: "sending", createdAt: Date.now() }];
      });
      try {
        const result = await client.send(input);
        await Promise.all([mutate(["thread", result.threadId]), refreshAll()]);
        setPending((list) => list.filter((p) => p.key !== key));
        if (input.draftId) void client.deleteDraft(input.draftId).catch(() => {});
        return result;
      } catch (err) {
        const msg =
          err instanceof MailClientError
            ? err.code === "network"
              ? "No connection — your message was not sent."
              : err.code === "too_large"
                ? "Attachments are too large."
                : err.code === "conflict"
                  ? "This message is still being sent. Check again in a moment."
                  : err.message
            : "Sending failed.";
        setPending((list) => list.map((p) => (p.key === key ? { ...p, status: "failed", error: msg } : p)));
        toast({ message: msg, tone: "error" });
        return null;
      } finally {
        inFlight.current.delete(key);
      }
    },
    [client, mutate, refreshAll, toast],
  );

  const value = React.useMemo<SendQueue>(
    () => ({
      pending,
      send: run,
      retry: async (key) => {
        const p = pending.find((x) => x.key === key);
        return p ? run(p.input) : null;
      },
      discard: (key) => setPending((list) => list.filter((p) => p.key !== key)),
    }),
    [pending, run],
  );
  return <SendCtx.Provider value={value}>{children}</SendCtx.Provider>;
}

/** Turn a pending send into a MessageView so the timeline can show it as an optimistic bubble. */
export function pendingToView(p: PendingSend, me: { email: string; name: string | null }): MessageView {
  return {
    id: `pending-${p.key}`,
    threadId: p.threadId ?? "",
    from: { email: me.email, name: me.name },
    to: p.input.to,
    cc: p.input.cc,
    bcc: p.input.bcc,
    replyTo: [],
    date: new Date(p.createdAt).toISOString(),
    subject: p.input.subject,
    snippet: p.input.text.slice(0, 120),
    fromMe: true,
    unread: false,
    starred: false,
    rfcMessageId: null,
    references: null,
    body: { text: p.input.text, quotedText: null, signature: null, html: null, hasRemoteImages: false, preferHtml: false },
    attachments: p.input.attachments.map((a, i) => ({
      id: `${p.key}-${i}`,
      messageId: `pending-${p.key}`,
      threadId: p.threadId ?? "",
      filename: a.filename,
      mimeType: a.mimeType,
      size: a.data.size,
      kind: a.mimeType.startsWith("image/") ? "image" : "other",
      date: new Date(p.createdAt).toISOString(),
      fromMe: true,
      senderName: "You",
      downloadUrl: "",
      previewUrl: null,
    })),
    pending: true,
  };
}
