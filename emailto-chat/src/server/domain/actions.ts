/**
 * Thread / message actions. Gmail is updated first; then the local index is updated right away
 * (optimistic consistency) by applying the same label change to the stored message rows and
 * re-running core analyzeThread — no extra Gmail round-trip. The next sync reconciles anything else.
 */
import type { MailAccount } from "@prisma/client";
import { analyzeThread } from "@/core/grouping";
import type { MessageAction, ThreadAction } from "@/core/types";
import { selfIdentity } from "../auth/account";
import { db } from "../db";
import { ApiError } from "../errors";
import { isGmailError } from "../gmail/errors";
import type { GmailApi, LabelChange } from "../gmail/types";
import { deleteLocalThread } from "./indexer";
import { analysisToThreadData, messageRowToIndexable } from "./mappers";

type Account = Pick<MailAccount, "id" | "emailAddress" | "aliases">;

/** Apply a label change to stored messages (all of the thread, or only `messageIds`) and re-derive the thread row. */
export async function applyLocalLabelChange(
  account: Account,
  gmailThreadId: string,
  change: LabelChange,
  messageIds?: string[],
): Promise<void> {
  const thread = await db.emailThread.findUnique({
    where: { accountId_gmailThreadId: { accountId: account.id, gmailThreadId } },
    include: { messages: true },
  });
  if (!thread || !thread.messages.length) return;
  const add = change.addLabelIds ?? [];
  const remove = new Set(change.removeLabelIds ?? []);
  const touched = thread.messages.map((m) => {
    if (messageIds && !messageIds.includes(m.gmailMessageId)) return m;
    const labels = [...new Set([...m.labelIds.filter((l) => !remove.has(l)), ...add])].sort();
    return { ...m, labelIds: labels };
  });
  const analysis = analyzeThread(touched.map(messageRowToIndexable), selfIdentity(account));
  await db.$transaction([
    ...touched
      .filter((m, i) => m.labelIds.join() !== thread.messages[i].labelIds.join())
      .map((m) =>
        db.emailMessage.update({
          where: { id: m.id },
          data: { labelIds: m.labelIds, isUnread: m.labelIds.includes("UNREAD"), isStarred: m.labelIds.includes("STARRED") },
        }),
      ),
    db.emailThread.update({ where: { id: thread.id }, data: analysisToThreadData(analysis) }),
  ]);
}

async function latestMessageId(account: Account, gmail: GmailApi, gmailThreadId: string): Promise<string> {
  const row = await db.emailMessage.findFirst({
    where: { accountId: account.id, gmailThreadId, NOT: { labelIds: { has: "TRASH" } } },
    orderBy: { internalDate: "desc" },
    select: { gmailMessageId: true },
  });
  if (row) return row.gmailMessageId;
  const t = await gmail.getThread(gmailThreadId);
  const msgs = (t.messages ?? []).filter((m) => m.id);
  if (!msgs.length) throw new ApiError("not_found", "Thread not found");
  msgs.sort((a, b) => Number(a.internalDate ?? 0) - Number(b.internalDate ?? 0));
  return msgs[msgs.length - 1].id!;
}

export async function modifyThread(account: Account, gmail: GmailApi, gmailThreadId: string, action: ThreadAction): Promise<void> {
  try {
    switch (action) {
      case "archive": {
        // Only THIS thread loses INBOX — other topics of the same person are untouched.
        const change = { removeLabelIds: ["INBOX"] };
        await gmail.modifyThread(gmailThreadId, change);
        return applyLocalLabelChange(account, gmailThreadId, change);
      }
      case "unarchive": {
        const change = { addLabelIds: ["INBOX"] };
        await gmail.modifyThread(gmailThreadId, change);
        return applyLocalLabelChange(account, gmailThreadId, change);
      }
      case "read": {
        const change = { removeLabelIds: ["UNREAD"] };
        await gmail.modifyThread(gmailThreadId, change);
        return applyLocalLabelChange(account, gmailThreadId, change);
      }
      case "unread": {
        const change = { addLabelIds: ["UNREAD"] };
        await gmail.modifyThread(gmailThreadId, change);
        return applyLocalLabelChange(account, gmailThreadId, change);
      }
      case "star": {
        // Gmail stars messages: star the latest one.
        const id = await latestMessageId(account, gmail, gmailThreadId);
        const change = { addLabelIds: ["STARRED"] };
        await gmail.modifyMessage(id, change);
        return applyLocalLabelChange(account, gmailThreadId, change, [id]);
      }
      case "unstar": {
        const change = { removeLabelIds: ["STARRED"] };
        await gmail.modifyThread(gmailThreadId, change);
        return applyLocalLabelChange(account, gmailThreadId, change);
      }
      case "trash": {
        await gmail.trashThread(gmailThreadId);
        return applyLocalLabelChange(account, gmailThreadId, { addLabelIds: ["TRASH"], removeLabelIds: ["INBOX"] });
      }
    }
  } catch (e) {
    if (isGmailError(e, "not_found")) {
      await deleteLocalThread(account.id, gmailThreadId);
      throw new ApiError("not_found", "Thread not found");
    }
    throw e;
  }
}

export async function modifyMessage(account: Account, gmail: GmailApi, gmailMessageId: string, action: MessageAction): Promise<void> {
  const change: LabelChange =
    action === "read"
      ? { removeLabelIds: ["UNREAD"] }
      : action === "unread"
        ? { addLabelIds: ["UNREAD"] }
        : action === "star"
          ? { addLabelIds: ["STARRED"] }
          : { removeLabelIds: ["STARRED"] };
  try {
    await gmail.modifyMessage(gmailMessageId, change);
  } catch (e) {
    if (isGmailError(e, "not_found")) throw new ApiError("not_found", "Message not found");
    throw e;
  }
  const row = await db.emailMessage.findUnique({
    where: { accountId_gmailMessageId: { accountId: account.id, gmailMessageId } },
    select: { gmailThreadId: true },
  });
  if (row) await applyLocalLabelChange(account, row.gmailThreadId, change, [gmailMessageId]);
}

/** "Show original": raw RFC 822 source, decoded. */
export async function getOriginal(gmail: GmailApi, gmailMessageId: string): Promise<string> {
  try {
    const m = await gmail.getMessage(gmailMessageId, "raw");
    return Buffer.from(m.raw ?? "", "base64url").toString("utf8");
  } catch (e) {
    if (isGmailError(e, "not_found")) throw new ApiError("not_found", "Message not found");
    throw e;
  }
}
