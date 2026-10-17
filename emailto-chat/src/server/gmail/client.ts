/**
 * GoogleGmailApi — the real Gmail implementation of `GmailApi`.
 * Thin, typed, with retry/backoff (429, 5xx, rateLimitExceeded 403) and error classification
 * (401 / invalid_grant → needs_reauth). Never logs request or response payloads.
 */
import { Readable } from "node:stream";
import { gmail as createGmail, type gmail_v1 } from "@googleapis/gmail";
import type { OAuth2Client } from "google-auth-library";
import type { GmailApi, HistoryPage, LabelChange, ListMessagesParams, ListThreadsParams, MessageFormat, SendAs } from "./types";
import { classifyGoogleError, withRetry, type RetryOptions } from "./retry";
import { GmailError } from "./errors";

const ME = "me";
/** Above this size the raw message is sent through the media upload endpoint (up to 35 MB). */
const MEDIA_UPLOAD_THRESHOLD = 4 * 1024 * 1024;

export interface GmailHooks {
  /** Called once when Gmail says the grant is gone (401 / invalid_grant / scope removed). */
  onAuthFailure?: () => Promise<void>;
}

export class GoogleGmailApi implements GmailApi {
  private readonly g: gmail_v1.Gmail;

  constructor(auth: OAuth2Client, private readonly hooks: GmailHooks = {}) {
    this.g = createGmail({ version: "v1", auth, timeout: 30_000 });
  }

  private async call<T>(fn: () => Promise<T>, o?: RetryOptions): Promise<T> {
    try {
      return await withRetry(fn, o);
    } catch (err) {
      const e = classifyGoogleError(err);
      if (e.kind === "needs_reauth") await this.hooks.onAuthFailure?.().catch(() => undefined);
      throw e;
    }
  }

  async getProfile() {
    const { data } = await this.call(() => this.g.users.getProfile({ userId: ME }));
    if (!data.emailAddress || !data.historyId) throw new GmailError("server", "gmail_profile_incomplete");
    return { emailAddress: data.emailAddress, historyId: String(data.historyId) };
  }

  async listThreads(p: ListThreadsParams) {
    const { data } = await this.call(() =>
      this.g.users.threads.list({
        userId: ME,
        q: p.q,
        pageToken: p.pageToken ?? undefined,
        maxResults: p.maxResults,
        labelIds: p.labelIds,
        includeSpamTrash: p.includeSpamTrash ?? false,
      }),
    );
    return {
      threads: (data.threads ?? []).filter((t) => t.id).map((t) => ({ id: t.id!, historyId: t.historyId, snippet: t.snippet })),
      nextPageToken: data.nextPageToken ?? null,
    };
  }

  async getThread(threadId: string) {
    const { data } = await this.call(() => this.g.users.threads.get({ userId: ME, id: threadId, format: "full" }));
    return data;
  }

  async modifyThread(threadId: string, change: LabelChange) {
    await this.call(() => this.g.users.threads.modify({ userId: ME, id: threadId, requestBody: change }));
  }

  async trashThread(threadId: string) {
    await this.call(() => this.g.users.threads.trash({ userId: ME, id: threadId }));
  }

  async getMessage(messageId: string, format: MessageFormat, metadataHeaders?: string[]) {
    const { data } = await this.call(() =>
      this.g.users.messages.get({ userId: ME, id: messageId, format, metadataHeaders }),
    );
    return data;
  }

  async modifyMessage(messageId: string, change: LabelChange) {
    await this.call(() => this.g.users.messages.modify({ userId: ME, id: messageId, requestBody: change }));
  }

  async sendMessage(input: { raw: string; threadId?: string | null }) {
    const threadId = input.threadId ?? undefined;
    // Sending is not idempotent: only retry rate-limit rejections (never accepted by Gmail).
    const { data } = await this.call(
      () =>
        input.raw.length > MEDIA_UPLOAD_THRESHOLD
          ? this.g.users.messages.send({
              userId: ME,
              requestBody: { threadId },
              media: { mimeType: "message/rfc822", body: Readable.from([Buffer.from(input.raw, "base64url")]) },
            })
          : this.g.users.messages.send({ userId: ME, requestBody: { raw: input.raw, threadId } }),
      { retryIf: (e) => e.kind === "rate_limited" },
    );
    if (!data.id || !data.threadId) throw new GmailError("server", "gmail_send_incomplete");
    return { id: data.id, threadId: data.threadId };
  }

  async getAttachment(messageId: string, attachmentId: string) {
    const { data } = await this.call(() =>
      this.g.users.messages.attachments.get({ userId: ME, messageId, id: attachmentId }),
    );
    return { data: data.data ?? "", size: data.size ?? 0 };
  }

  async listMessages(p: ListMessagesParams) {
    const { data } = await this.call(() =>
      this.g.users.messages.list({
        userId: ME,
        q: p.q,
        pageToken: p.pageToken ?? undefined,
        maxResults: p.maxResults,
        includeSpamTrash: p.includeSpamTrash ?? false,
      }),
    );
    return {
      messages: (data.messages ?? [])
        .filter((m) => m.id && m.threadId)
        .map((m) => ({ id: m.id!, threadId: m.threadId! })),
      nextPageToken: data.nextPageToken ?? null,
    };
  }

  async createDraft(input: { raw: string; threadId?: string | null }) {
    const { data } = await this.call(() =>
      this.g.users.drafts.create({
        userId: ME,
        requestBody: { message: { raw: input.raw, threadId: input.threadId ?? undefined } },
      }),
    );
    if (!data.id) throw new GmailError("server", "gmail_draft_incomplete");
    return { id: data.id };
  }

  async updateDraft(draftId: string, input: { raw: string; threadId?: string | null }) {
    const { data } = await this.call(() =>
      this.g.users.drafts.update({
        userId: ME,
        id: draftId,
        requestBody: { id: draftId, message: { raw: input.raw, threadId: input.threadId ?? undefined } },
      }),
    );
    return { id: data.id ?? draftId };
  }

  async deleteDraft(draftId: string) {
    await this.call(() => this.g.users.drafts.delete({ userId: ME, id: draftId }));
  }

  async listHistory(p: { startHistoryId: string; pageToken?: string | null; historyTypes?: string[] }): Promise<HistoryPage> {
    const { data } = await this.call(() =>
      this.g.users.history.list({
        userId: ME,
        startHistoryId: p.startHistoryId,
        pageToken: p.pageToken ?? undefined,
        historyTypes: p.historyTypes,
        maxResults: 500,
      }),
    );
    return { history: data.history ?? [], nextPageToken: data.nextPageToken ?? null, historyId: data.historyId ?? null };
  }

  async watch(p: { topicName: string; labelIds?: string[] }) {
    const { data } = await this.call(() =>
      this.g.users.watch({ userId: ME, requestBody: { topicName: p.topicName, labelIds: p.labelIds } }),
    );
    return { historyId: String(data.historyId ?? ""), expiration: String(data.expiration ?? "") };
  }

  async stop() {
    await this.call(() => this.g.users.stop({ userId: ME }));
  }

  async listSendAs(): Promise<SendAs[]> {
    const { data } = await this.call(() => this.g.users.settings.sendAs.list({ userId: ME }));
    return (data.sendAs ?? [])
      .filter((s) => s.sendAsEmail)
      .map((s) => ({
        sendAsEmail: s.sendAsEmail!,
        displayName: s.displayName,
        isPrimary: s.isPrimary,
        verificationStatus: s.verificationStatus,
      }));
  }
}
