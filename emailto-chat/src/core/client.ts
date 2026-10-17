import type {
  AccountInfo,
  AttachmentView,
  ConversationDetail,
  ConversationList,
  ConversationRef,
  DraftInput,
  Mailbox,
  MessageAction,
  PersonSummary,
  ReadFilter,
  SearchResult,
  SendInput,
  SendResult,
  SyncStatus,
  ThreadAction,
  ThreadDetail,
  UserPreferences,
} from "./types";

export type AttachmentScope =
  | { kind: "thread"; threadId: string }
  | { kind: "person"; id: string }
  | { kind: "group"; id: string };

/**
 * The single data contract the UI talks to.
 *
 * - `ApiMailClient` (src/lib/api-client.ts) calls the backend → Gmail.
 * - `DemoMailClient` (src/demo/demo-client.ts) runs fully in the browser on sample data.
 *
 * Keeping this interface free of framework types is what lets a future
 * React Native / Expo app reuse the same models and business logic.
 */
export interface MailClient {
  readonly mode: "demo" | "live";

  me(): Promise<AccountInfo>;
  updatePreferences(patch: Partial<UserPreferences>): Promise<UserPreferences>;

  listConversations(params: { mailbox: Mailbox; filter: ReadFilter }): Promise<ConversationList>;
  /** All threads with a person (direct + group threads they took part in) or of a group. */
  getConversation(ref: ConversationRef): Promise<ConversationDetail>;
  /** Find (or create the index entry for) a person by e-mail address. */
  findPerson(email: string): Promise<PersonSummary | null>;

  getThread(threadId: string): Promise<ThreadDetail>;
  listAttachments(scope: AttachmentScope): Promise<AttachmentView[]>;
  search(query: string): Promise<SearchResult>;

  modifyThread(threadId: string, action: ThreadAction): Promise<void>;
  modifyMessage(messageId: string, action: MessageAction): Promise<void>;

  send(input: SendInput): Promise<SendResult>;
  saveDraft(input: DraftInput): Promise<{ draftId: string }>;
  deleteDraft(draftId: string): Promise<void>;

  /** Raw RFC 822 source ("Show original"). */
  getOriginal(messageId: string): Promise<string>;

  /** Trigger an incremental sync (no-op in demo). */
  sync(): Promise<SyncStatus>;
}

export class MailClientError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "unauthorized"
      | "needs_reauth"
      | "not_found"
      | "rate_limited"
      | "network"
      | "conflict"
      | "too_large"
      | "invalid"
      | "server",
    public readonly status?: number,
  ) {
    super(message);
    this.name = "MailClientError";
  }
}
