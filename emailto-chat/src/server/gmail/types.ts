/**
 * The Gmail API surface the app uses. `GoogleGmailApi` implements it against the real API;
 * tests use an in-memory `FakeGmail`. Domain and sync code depend only on this interface.
 */
import type { gmail_v1 } from "@googleapis/gmail";

export type GmailThread = gmail_v1.Schema$Thread;
export type GmailMessage = gmail_v1.Schema$Message;
export type GmailMessagePart = gmail_v1.Schema$MessagePart;
export type GmailHistory = gmail_v1.Schema$History;

export interface ListThreadsParams {
  q?: string;
  pageToken?: string | null;
  maxResults?: number;
  labelIds?: string[];
  includeSpamTrash?: boolean;
}

export interface ThreadRef {
  id: string;
  historyId?: string | null;
  snippet?: string | null;
}

export interface ListMessagesParams {
  q?: string;
  pageToken?: string | null;
  maxResults?: number;
  includeSpamTrash?: boolean;
}

export interface MessageRef {
  id: string;
  threadId: string;
}

export interface HistoryPage {
  history: GmailHistory[];
  nextPageToken: string | null;
  historyId: string | null;
}

export interface LabelChange {
  addLabelIds?: string[];
  removeLabelIds?: string[];
}

export interface SendAs {
  sendAsEmail: string;
  displayName?: string | null;
  isPrimary?: boolean | null;
  verificationStatus?: string | null;
}

export type MessageFormat = "full" | "metadata" | "raw" | "minimal";

export interface GmailApi {
  getProfile(): Promise<{ emailAddress: string; historyId: string }>;
  listThreads(p: ListThreadsParams): Promise<{ threads: ThreadRef[]; nextPageToken: string | null }>;
  /** format=full. Throws GmailError(not_found) when the thread no longer exists. */
  getThread(threadId: string): Promise<GmailThread>;
  modifyThread(threadId: string, change: LabelChange): Promise<void>;
  trashThread(threadId: string): Promise<void>;
  getMessage(messageId: string, format: MessageFormat, metadataHeaders?: string[]): Promise<GmailMessage>;
  modifyMessage(messageId: string, change: LabelChange): Promise<void>;
  sendMessage(input: { raw: string; threadId?: string | null }): Promise<{ id: string; threadId: string }>;
  /** Returns base64url data. */
  getAttachment(messageId: string, attachmentId: string): Promise<{ data: string; size: number }>;
  listMessages(p: ListMessagesParams): Promise<{ messages: MessageRef[]; nextPageToken: string | null }>;
  createDraft(input: { raw: string; threadId?: string | null }): Promise<{ id: string }>;
  updateDraft(draftId: string, input: { raw: string; threadId?: string | null }): Promise<{ id: string }>;
  deleteDraft(draftId: string): Promise<void>;
  /** Throws GmailError(not_found) when startHistoryId is too old (cursor expired). */
  listHistory(p: { startHistoryId: string; pageToken?: string | null; historyTypes?: string[] }): Promise<HistoryPage>;
  watch(p: { topicName: string; labelIds?: string[] }): Promise<{ historyId: string; expiration: string }>;
  stop(): Promise<void>;
  listSendAs(): Promise<SendAs[]>;
}
