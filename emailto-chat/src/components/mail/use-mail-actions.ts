"use client";

import * as React from "react";
import { useSWRConfig } from "swr";
import type { ConversationDetail, MessageAction, ThreadAction, ThreadDetail, ThreadSummary } from "@/core/types";
import { useMail } from "./mail-context";
import { useToast } from "./send-queue";

function patchThreadSummary(t: ThreadSummary, action: ThreadAction): ThreadSummary {
  switch (action) {
    case "archive":
      return { ...t, inInbox: false };
    case "unarchive":
      return { ...t, inInbox: true };
    case "read":
      return { ...t, unreadCount: 0 };
    case "unread":
      return { ...t, unreadCount: Math.max(1, t.unreadCount) };
    case "star":
      return { ...t, starred: true };
    case "unstar":
      return { ...t, starred: false };
    default:
      return t;
  }
}

/** Optimistic, semantically-scoped actions: they only ever touch ONE thread or ONE message. */
export function useMailActions() {
  const { client, refreshAll } = useMail();
  const { mutate } = useSWRConfig();
  const toast = useToast();

  const modifyThread = React.useCallback(
    async (threadId: string, action: ThreadAction, opts: { silent?: boolean } = {}) => {
      // 1. Optimistic: this thread's detail…
      await mutate<ThreadDetail>(
        ["thread", threadId],
        (cur) =>
          cur && {
            thread: patchThreadSummary(cur.thread, action),
            messages: cur.messages.map((m) =>
              action === "read" ? { ...m, unread: false } : action === "unstar" ? { ...m, starred: false } : m,
            ),
          },
        { revalidate: false },
      );
      // …and every conversation view containing it (person + group views share the same thread).
      await mutate<ConversationDetail>(
        (key) => Array.isArray(key) && key[0] === "conversation",
        (cur) =>
          cur && {
            ...cur,
            threads: action === "trash" ? cur.threads.filter((t) => t.id !== threadId) : cur.threads.map((t) => (t.id === threadId ? patchThreadSummary(t, action) : t)),
          },
        { revalidate: false },
      );
      // 2. Server (Gmail is the source of truth) → 3. re-sync derived views.
      try {
        await client.modifyThread(threadId, action);
        if (!opts.silent) {
          const labels: Partial<Record<ThreadAction, string>> = { archive: "Topic archived", unarchive: "Moved to Inbox", trash: "Topic moved to Trash", unread: "Marked as unread" };
          const msg = labels[action];
          if (msg)
            toast({
              message: msg,
              tone: "success",
              action:
                action === "archive"
                  ? {
                      label: "Undo",
                      onClick: () =>
                        void client
                          .modifyThread(threadId, "unarchive")
                          .catch(() => toast({ message: "Undo failed", tone: "error" }))
                          .finally(() => void refreshAll()),
                    }
                  : undefined,
            });
        }
      } catch (err) {
        toast({ message: err instanceof Error ? err.message : "Action failed", tone: "error" });
      } finally {
        await refreshAll();
      }
    },
    [client, mutate, refreshAll, toast],
  );

  const modifyMessage = React.useCallback(
    async (threadId: string, messageId: string, action: MessageAction) => {
      await mutate<ThreadDetail>(
        ["thread", threadId],
        (cur) =>
          cur && {
            ...cur,
            messages: cur.messages.map((m) =>
              m.id !== messageId
                ? m
                : action === "read" || action === "unread"
                  ? { ...m, unread: action === "unread" }
                  : { ...m, starred: action === "star" },
            ),
          },
        { revalidate: false },
      );
      try {
        await client.modifyMessage(messageId, action);
        if (action === "unread") toast({ message: "Marked as unread", tone: "success" });
      } catch (err) {
        toast({ message: err instanceof Error ? err.message : "Action failed", tone: "error" });
      } finally {
        await refreshAll();
      }
    },
    [client, mutate, refreshAll, toast],
  );

  return { modifyThread, modifyMessage };
}
