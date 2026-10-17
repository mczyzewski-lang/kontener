/**
 * Domain view models shared by the UI, the backend API, the demo data source
 * and (later) native apps. Pure TypeScript — no Next.js, Prisma or DOM imports.
 *
 * The product model is "person first":
 *   Conversation (person or group) → Threads (Gmail threadId, shown as tabs) → Messages.
 * Gmail stays the source of truth; these are projections of it.
 */

export type Mailbox = "inbox" | "sent" | "archive" | "all";
export type ReadFilter = "all" | "unread";

export interface Address {
  /** Normalized (trimmed, lower-cased) e-mail address. Identity key for contacts. */
  email: string;
  /** Display name as seen in headers, if any. Never used to merge contacts. */
  name?: string | null;
}

export type ConversationKind = "person" | "group";

export interface ConversationRef {
  kind: ConversationKind;
  /** person: contact id · group: group key (hash of the participant set) */
  id: string;
}

export interface PersonSummary {
  kind: "person";
  id: string;
  email: string;
  name: string | null;
  /** True for "notes to self" threads (only my own addresses involved). */
  isSelf?: boolean;
  lastActivityAt: string | null;
  lastSnippet: string;
  lastFromMe: boolean;
  /** Aggregate: unread messages in this person's direct threads (within the listed mailbox). */
  unreadCount: number;
  threadCount: number;
}

export interface GroupSummary {
  kind: "group";
  id: string;
  /** Other participants (my own addresses excluded). */
  members: Address[];
  /** e.g. "Anna, Michał + 2" */
  title: string;
  lastActivityAt: string | null;
  lastSnippet: string;
  lastSenderName: string | null;
  lastFromMe: boolean;
  unreadCount: number;
  threadCount: number;
}

export type ConversationSummary = PersonSummary | GroupSummary;

export interface ConversationList {
  people: PersonSummary[];
  groups: GroupSummary[];
}

export interface ThreadSummary {
  /** Canonical Gmail threadId. */
  id: string;
  subject: string;
  snippet: string;
  lastMessageAt: string;
  messageCount: number;
  unreadCount: number;
  isGroup: boolean;
  /** Other participants of the thread (me excluded). */
  participants: Address[];
  inInbox: boolean;
  starred: boolean;
  hasAttachments: boolean;
  /** Group key when isGroup — lets the UI jump from a person to the group conversation. */
  groupId?: string | null;
}

export interface ConversationDetail {
  conversation: ConversationSummary;
  /** Newest activity first. */
  threads: ThreadSummary[];
}

export interface MessageBody {
  /** Main plain-text content, without quoted history and signature. */
  text: string | null;
  /** Quoted previous messages (collapsed by default). */
  quotedText: string | null;
  /** Detected signature / footer (collapsed by default, never deleted). */
  signature: string | null;
  /** Sanitized HTML (scripts removed, remote images blocked) or null when plain text only. */
  html: string | null;
  hasRemoteImages: boolean;
  /** True when we should prefer the HTML rendering (no usable plain-text part). */
  preferHtml: boolean;
}

export type AttachmentKind = "image" | "document" | "other";

export interface AttachmentView {
  id: string;
  messageId: string;
  threadId: string;
  filename: string;
  mimeType: string;
  size: number;
  kind: AttachmentKind;
  date: string;
  fromMe: boolean;
  senderName: string | null;
  /** URL that downloads the file (Content-Disposition: attachment). */
  downloadUrl: string;
  /** URL that can be displayed inline (safe images / PDF only), else null. */
  previewUrl: string | null;
}

export interface MessageView {
  id: string;
  threadId: string;
  from: Address;
  to: Address[];
  cc: Address[];
  bcc: Address[];
  replyTo: Address[];
  date: string;
  subject: string;
  snippet: string;
  fromMe: boolean;
  unread: boolean;
  starred: boolean;
  /** RFC 822 Message-ID header (with angle brackets). */
  rfcMessageId: string | null;
  references: string | null;
  body: MessageBody;
  attachments: AttachmentView[];
  /** Locally simulated or optimistic, not yet confirmed by Gmail. */
  pending?: boolean;
}

export interface ThreadDetail {
  thread: ThreadSummary;
  /** Oldest first, like a chat. */
  messages: MessageView[];
}

export type ThreadAction = "archive" | "unarchive" | "read" | "unread" | "star" | "unstar" | "trash";
export type MessageAction = "read" | "unread" | "star" | "unstar";

export type ComposeMode = "new" | "reply" | "replyAll" | "forward" | "newTopic";

export interface OutgoingAttachment {
  filename: string;
  mimeType: string;
  /** Browser File/Blob on the client side. */
  data: Blob;
}

export interface SendInput {
  /** Client-generated key, reused on retries → server never sends twice. */
  idempotencyKey: string;
  mode: ComposeMode;
  /** Required for reply/replyAll; forward and new topics start a new thread. */
  threadId?: string | null;
  /** Message being replied to / forwarded. */
  inReplyToMessageId?: string | null;
  to: Address[];
  cc: Address[];
  bcc: Address[];
  subject: string;
  text: string;
  attachments: OutgoingAttachment[];
  /** Gmail draft to delete after a successful send. */
  draftId?: string | null;
  /** Send-as alias; defaults to the primary address. */
  from?: string | null;
}

export interface SendResult {
  messageId: string;
  threadId: string;
  /** True when the server recognised the idempotency key and did not send again. */
  deduplicated?: boolean;
}

export interface DraftInput {
  draftId?: string | null;
  threadId?: string | null;
  inReplyToMessageId?: string | null;
  to: Address[];
  cc: Address[];
  bcc: Address[];
  subject: string;
  text: string;
}

export interface SearchResult {
  people: PersonSummary[];
  groups: GroupSummary[];
  threads: Array<ThreadSummary & { conversation: ConversationRef | null }>;
}

export interface SyncStatus {
  state: "idle" | "syncing" | "error" | "needs_reauth" | "disconnected";
  lastSyncAt: string | null;
  initialSyncComplete: boolean;
  backfillComplete: boolean;
  threadCount: number;
  error?: string | null;
}

export interface UserPreferences {
  /** Enter sends, Shift+Enter new line. When false: Ctrl/⌘+Enter sends. */
  enterToSend: boolean;
  theme: "system" | "light" | "dark";
  /** Remote images are blocked by default (tracking pixels). */
  alwaysLoadRemoteImages: boolean;
  /** Seconds between background syncs while the app is open. */
  pollIntervalSec: number;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  enterToSend: true,
  theme: "system",
  alwaysLoadRemoteImages: false,
  pollIntervalSec: 45,
};

export interface AccountInfo {
  mode: "demo" | "live";
  user: { id: string; name: string | null; email: string; image: string | null };
  mailAccount: {
    email: string;
    /** active | needs_reauth (token revoked/expired) */
    status: "active" | "needs_reauth";
    /** My own addresses (primary + send-as aliases). */
    aliases: string[];
    pushEnabled: boolean;
  } | null;
  preferences: UserPreferences;
}
