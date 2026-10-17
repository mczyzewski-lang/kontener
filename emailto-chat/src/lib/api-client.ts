/**
 * Browser-side MailClient that talks to the emailto.chat API (src/app/api/**).
 * Same-origin cookies carry the session; errors become MailClientError with the server's code.
 */
import { MailClientError, type AttachmentScope, type MailClient } from "@/core/client";
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
} from "@/core/types";

type ErrorCode = MailClientError["code"];
const KNOWN_CODES: ErrorCode[] = [
  "unauthorized",
  "needs_reauth",
  "not_found",
  "rate_limited",
  "network",
  "conflict",
  "too_large",
  "invalid",
  "server",
];

function codeForStatus(status: number): ErrorCode {
  if (status === 401) return "unauthorized";
  if (status === 403) return "needs_reauth";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  if (status === 413) return "too_large";
  if (status === 429) return "rate_limited";
  if (status >= 400 && status < 500) return "invalid";
  return "server";
}

export class ApiMailClient implements MailClient {
  readonly mode = "live" as const;

  constructor(private readonly baseUrl = "") {}

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    let res: Response;
    try {
      res = await fetch(this.baseUrl + path, {
        credentials: "same-origin",
        cache: "no-store",
        ...init,
        headers: { Accept: "application/json", ...(init.headers ?? {}) },
      });
    } catch (e) {
      throw new MailClientError(e instanceof Error && e.message ? `Network error: ${e.message}` : "Network error", "network");
    }
    if (!res.ok) {
      let code = codeForStatus(res.status);
      let message = res.statusText || `HTTP ${res.status}`;
      try {
        const body = (await res.json()) as { error?: { code?: string; message?: string } };
        if (body.error?.code && KNOWN_CODES.includes(body.error.code as ErrorCode)) code = body.error.code as ErrorCode;
        if (body.error?.message) message = body.error.message;
      } catch {
        // non-JSON error body
      }
      throw new MailClientError(message, code, res.status);
    }
    return res;
  }

  private async json<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await this.request(path, init);
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  private send_<T>(method: string, path: string, body?: unknown): Promise<T> {
    return this.json<T>(path, {
      method,
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  me(): Promise<AccountInfo> {
    return this.json("/api/me");
  }

  updatePreferences(patch: Partial<UserPreferences>): Promise<UserPreferences> {
    return this.send_("PATCH", "/api/preferences", patch);
  }

  listConversations(params: { mailbox: Mailbox; filter: ReadFilter }): Promise<ConversationList> {
    const q = new URLSearchParams({ mailbox: params.mailbox, filter: params.filter });
    return this.json(`/api/conversations?${q}`);
  }

  getConversation(ref: ConversationRef): Promise<ConversationDetail> {
    return this.json(`/api/conversations/${ref.kind}/${encodeURIComponent(ref.id)}`);
  }

  findPerson(email: string): Promise<PersonSummary | null> {
    return this.json(`/api/people/lookup?${new URLSearchParams({ email })}`);
  }

  getThread(threadId: string): Promise<ThreadDetail> {
    return this.json(`/api/threads/${encodeURIComponent(threadId)}`);
  }

  listAttachments(scope: AttachmentScope): Promise<AttachmentView[]> {
    const q = new URLSearchParams(
      scope.kind === "thread" ? { scope: "thread", id: scope.threadId } : { scope: scope.kind, id: scope.id },
    );
    return this.json(`/api/attachments?${q}`);
  }

  search(query: string): Promise<SearchResult> {
    return this.json(`/api/search?${new URLSearchParams({ q: query })}`);
  }

  async modifyThread(threadId: string, action: ThreadAction): Promise<void> {
    await this.send_("POST", `/api/threads/${encodeURIComponent(threadId)}/modify`, { action });
  }

  async modifyMessage(messageId: string, action: MessageAction): Promise<void> {
    await this.send_("POST", `/api/messages/${encodeURIComponent(messageId)}/modify`, { action });
  }

  send(input: SendInput): Promise<SendResult> {
    const { attachments, ...payload } = input;
    const form = new FormData();
    form.set("payload", JSON.stringify(payload));
    for (const a of attachments ?? []) {
      const file = a.data instanceof File ? a.data : new File([a.data], a.filename, { type: a.mimeType || "application/octet-stream" });
      form.append("attachments", file, a.filename);
    }
    // No Content-Type header: the browser sets the multipart boundary.
    return this.json("/api/send", { method: "POST", body: form });
  }

  saveDraft(input: DraftInput): Promise<{ draftId: string }> {
    return this.send_("POST", "/api/drafts", input);
  }

  async deleteDraft(draftId: string): Promise<void> {
    await this.send_("DELETE", `/api/drafts/${encodeURIComponent(draftId)}`);
  }

  async getOriginal(messageId: string): Promise<string> {
    const res = await this.request(`/api/messages/${encodeURIComponent(messageId)}/original`, { headers: { Accept: "text/plain" } });
    return res.text();
  }

  sync(): Promise<SyncStatus> {
    return this.send_("POST", "/api/sync");
  }

  /** Not part of MailClient: current sync status without triggering a sync. */
  syncStatus(): Promise<SyncStatus> {
    return this.json("/api/sync");
  }

  /** Not part of MailClient: account management helpers for settings screens. */
  async logout(): Promise<void> {
    await this.send_("POST", "/api/auth/logout");
  }

  async disconnectGmail(): Promise<void> {
    await this.send_("POST", "/api/account/disconnect");
  }

  async deleteAccount(): Promise<void> {
    await this.send_("DELETE", "/api/account");
  }
}

export function createApiClient(baseUrl = ""): ApiMailClient {
  return new ApiMailClient(baseUrl);
}
