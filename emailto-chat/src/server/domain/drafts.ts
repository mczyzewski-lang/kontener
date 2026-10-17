/** Gmail drafts. We keep only a (account, draftId, threadId) mapping — content lives in Gmail. */
import type { MailAccount, User } from "@prisma/client";
import { dedupeAddresses } from "@/core/addresses";
import type { DraftInput } from "@/core/types";
import { db } from "../db";
import { isGmailError } from "../gmail/errors";
import type { GmailApi } from "../gmail/types";
import { buildRaw, loadReplyContext, resolveFrom } from "./compose";

export async function saveDraft(
  deps: { account: MailAccount; user: Pick<User, "name">; gmail: GmailApi },
  input: DraftInput,
): Promise<{ draftId: string }> {
  const { account, gmail } = deps;
  let threadId: string | null = null;
  let subject = input.subject;
  let inReplyTo: string | null = null;
  let references: string | null = null;
  if (input.inReplyToMessageId || input.threadId) {
    try {
      const ctx = await loadReplyContext(gmail, input.inReplyToMessageId, input.threadId);
      threadId = ctx.threadId;
      inReplyTo = ctx.inReplyTo;
      references = ctx.references;
      subject = input.subject.trim() ? input.subject : ctx.subject;
    } catch (e) {
      if (!isGmailError(e) && !(e as { code?: string }).code) throw e;
      threadId = null;
    }
  }
  const to = dedupeAddresses(input.to);
  const raw = buildRaw({
    from: resolveFrom(account, deps.user, null),
    to,
    cc: dedupeAddresses(input.cc),
    bcc: dedupeAddresses(input.bcc),
    subject,
    text: input.text,
    inReplyTo,
    references,
  });

  let draftId: string;
  if (input.draftId) {
    try {
      draftId = (await gmail.updateDraft(input.draftId, { raw, threadId })).id;
    } catch (e) {
      if (!isGmailError(e, "not_found")) throw e;
      draftId = (await gmail.createDraft({ raw, threadId })).id;
      await db.draft.deleteMany({ where: { accountId: account.id, gmailDraftId: input.draftId } });
    }
  } else {
    draftId = (await gmail.createDraft({ raw, threadId })).id;
  }
  await db.draft.upsert({
    where: { accountId_gmailDraftId: { accountId: account.id, gmailDraftId: draftId } },
    create: { accountId: account.id, gmailDraftId: draftId, threadId },
    update: { threadId },
  });
  return { draftId };
}

export async function deleteDraft(account: Pick<MailAccount, "id">, gmail: GmailApi, draftId: string): Promise<void> {
  try {
    await gmail.deleteDraft(draftId);
  } catch (e) {
    if (!isGmailError(e, "not_found")) throw e;
  }
  await db.draft.deleteMany({ where: { accountId: account.id, gmailDraftId: draftId } });
}
