/**
 * Read model: builds the core view models (ConversationList, ConversationDetail, SearchResult)
 * from the metadata index.
 *
 * Strategy (MVP, documented): we load the thread *summary rows* (no bodies; one row per thread)
 * for the account that match the mailbox, then call core `aggregateConversations`, so the server
 * and the demo share exactly one implementation of the person/group rules. Unread counts are
 * computed at query time from thread rows — never stored per person. This is comfortably fast
 * for a few thousand threads (MAX_BACKFILL_THREADS defaults to 1500); a SQL GROUP BY version can
 * replace it later without changing the API.
 *
 * Every query filters by accountId (strict user isolation).
 */
import type { EmailThread, MailAccount, Prisma } from "@prisma/client";
import { isValidEmail, normalizeEmail } from "@/core/addresses";
import { aggregateConversations, groupTitle } from "@/core/grouping";
import type {
  ConversationDetail,
  ConversationList,
  ConversationRef,
  GroupSummary,
  Mailbox,
  PersonSummary,
  ReadFilter,
  SearchResult,
  ThreadSummary,
} from "@/core/types";
import { selfIdentity } from "../auth/account";
import { db } from "../db";
import { ApiError } from "../errors";
import type { GmailApi } from "../gmail/types";
import { log } from "../log";
import { indexThread } from "./indexer";
import { threadRowToAnalysis, threadRowToSummary } from "./mappers";

type Account = Pick<MailAccount, "id" | "emailAddress" | "aliases">;

function mailboxWhere(accountId: string, mailbox: Mailbox): Prisma.EmailThreadWhereInput {
  const base: Prisma.EmailThreadWhereInput = { accountId, hidden: false };
  switch (mailbox) {
    case "inbox":
      return { ...base, inInbox: true };
    case "sent":
      return { ...base, hasSent: true };
    case "archive":
      return { ...base, inInbox: false };
    default:
      return base;
  }
}

async function contactMaps(accountId: string, emails: string[]) {
  const unique = [...new Set(emails)];
  const contacts = unique.length
    ? await db.contact.findMany({ where: { accountId, email: { in: unique } }, select: { id: true, email: true, name: true } })
    : [];
  return {
    ids: new Map(contacts.map((c) => [c.email, c.id])),
    names: new Map(contacts.map((c) => [c.email, c.name])),
  };
}

function emailsOf(rows: EmailThread[]): string[] {
  const out: string[] = [];
  for (const r of rows) {
    if (r.counterpartEmail) out.push(r.counterpartEmail);
    for (const p of threadRowToAnalysis(r).others) out.push(p.email);
  }
  return out;
}

async function aggregate(account: Account, rows: EmailThread[], mailbox: Mailbox, filter: ReadFilter): Promise<ConversationList> {
  const { ids, names } = await contactMaps(account.id, emailsOf(rows));
  const missing = new Set<string>();
  const list = aggregateConversations(rows.map(threadRowToAnalysis), {
    mailbox,
    filter,
    self: selfIdentity(account),
    names,
    contactId: (email) => {
      const id = ids.get(email);
      if (!id) missing.add(email);
      return id ?? "";
    },
  });
  if (missing.size) {
    // Should not happen (the indexer creates contacts) — repair and retry once.
    await db.contact.createMany({ data: [...missing].map((email) => ({ accountId: account.id, email })), skipDuplicates: true });
    const repaired = await contactMaps(account.id, [...missing]);
    for (const p of list.people) if (!p.id) p.id = repaired.ids.get(p.email) ?? "";
  }
  return list;
}

export async function listConversations(
  account: Account,
  params: { mailbox: Mailbox; filter: ReadFilter },
): Promise<ConversationList> {
  const where = mailboxWhere(account.id, params.mailbox);
  const rows = await db.emailThread.findMany({ where, orderBy: { lastMessageAt: "desc" } });
  return aggregate(account, rows, params.mailbox, params.filter);
}

function emptyPerson(c: { id: string; email: string; name: string | null }, isSelf: boolean): PersonSummary {
  return {
    kind: "person",
    id: c.id,
    email: c.email,
    name: c.name,
    ...(isSelf ? { isSelf: true } : {}),
    lastActivityAt: null,
    lastSnippet: "",
    lastFromMe: false,
    unreadCount: 0,
    threadCount: 0,
  };
}

export async function getConversation(account: Account, ref: ConversationRef): Promise<ConversationDetail> {
  if (ref.kind === "person") {
    const contact = await db.contact.findFirst({ where: { id: ref.id, accountId: account.id } });
    if (!contact) throw new ApiError("not_found", "Person not found");
    const rows = await db.emailThread.findMany({
      where: { accountId: account.id, hidden: false, participants: { some: { contactId: contact.id } } },
      orderBy: { lastMessageAt: "desc" },
    });
    const direct = rows.filter((r) => !r.isGroup);
    const list = await aggregate(account, direct, "all", "all");
    const isSelf = selfIdentity(account).addresses.has(contact.email);
    const person = list.people.find((p) => p.email === contact.email) ?? emptyPerson(contact, isSelf);
    if (!person.lastActivityAt && rows.length) {
      person.lastActivityAt = rows[0].lastMessageAt.toISOString();
      person.lastSnippet = rows[0].snippet;
      person.lastFromMe = rows[0].lastFromMe;
    }
    return { conversation: { ...person, id: contact.id, name: contact.name ?? person.name }, threads: rows.map(threadRowToSummary) };
  }

  const rows = await db.emailThread.findMany({
    where: { accountId: account.id, hidden: false, groupKey: ref.id },
    orderBy: { lastMessageAt: "desc" },
  });
  if (!rows.length) throw new ApiError("not_found", "Group not found");
  const list = await aggregate(account, rows, "all", "all");
  const group = list.groups.find((g) => g.id === ref.id);
  if (!group) throw new ApiError("not_found", "Group not found");
  return { conversation: group, threads: rows.map(threadRowToSummary) };
}

/**
 * Find a person by e-mail. Creates the contact index entry when the address is valid but unknown,
 * so the UI can open a conversation (and compose) with someone new.
 */
export async function findPerson(account: Account, email: string): Promise<PersonSummary | null> {
  const e = normalizeEmail(email);
  if (!isValidEmail(e)) return null;
  const contact =
    (await db.contact.findUnique({ where: { accountId_email: { accountId: account.id, email: e } } })) ??
    (await db.contact.upsert({
      where: { accountId_email: { accountId: account.id, email: e } },
      create: { accountId: account.id, email: e },
      update: {},
    }));
  const detail = await getConversation(account, { kind: "person", id: contact.id });
  return detail.conversation as PersonSummary;
}

function conversationRefFor(row: EmailThread, contactIds: Map<string, string>): ConversationRef | null {
  if (row.isGroup && row.groupKey) return { kind: "group", id: row.groupKey };
  const id = row.counterpartEmail ? contactIds.get(row.counterpartEmail) : undefined;
  return id ? { kind: "person", id } : null;
}

function escapeLike(q: string): string {
  return q.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Search = local index (people by name/e-mail, groups by member, threads by subject) +
 * Gmail full-text search (messages.list q=…) mapped to local threads. Threads Gmail finds that
 * are not indexed yet are indexed on the fly (bounded).
 */
export async function search(account: Account, gmail: GmailApi | null, query: string): Promise<SearchResult> {
  const q = query.trim();
  if (!q) return { people: [], groups: [], threads: [] };
  const like = escapeLike(q);

  const contacts = await db.contact.findMany({
    where: {
      accountId: account.id,
      OR: [{ email: { contains: like, mode: "insensitive" } }, { name: { contains: like, mode: "insensitive" } }],
    },
    select: { id: true, email: true, name: true },
    take: 50,
  });
  const matchedEmails = new Set(contacts.map((c) => c.email));

  const subjectRows = await db.emailThread.findMany({
    where: { accountId: account.id, hidden: false, subject: { contains: like, mode: "insensitive" } },
    orderBy: { lastMessageAt: "desc" },
    take: 25,
  });

  // Gmail full-text search.
  let gmailRows: EmailThread[] = [];
  if (gmail) {
    try {
      const res = await gmail.listMessages({ q, maxResults: 50 });
      const threadIds = [...new Set(res.messages.map((m) => m.threadId))].slice(0, 25);
      const local = await db.emailThread.findMany({ where: { accountId: account.id, gmailThreadId: { in: threadIds } } });
      const known = new Set(local.map((r) => r.gmailThreadId));
      const missing = threadIds.filter((id) => !known.has(id)).slice(0, 8);
      for (const id of missing) {
        try {
          await indexThread(account, await gmail.getThread(id));
        } catch {
          // ignore — thread may have vanished
        }
      }
      if (missing.length) {
        gmailRows = await db.emailThread.findMany({ where: { accountId: account.id, gmailThreadId: { in: threadIds } } });
      } else gmailRows = local;
      const order = new Map(threadIds.map((id, i) => [id, i]));
      gmailRows = gmailRows.filter((r) => !r.hidden).sort((a, b) => order.get(a.gmailThreadId)! - order.get(b.gmailThreadId)!);
    } catch (e) {
      log.warn("search_gmail_failed", { accountId: account.id, code: (e as { kind?: string }).kind ?? "unknown" });
    }
  }

  // People & groups: aggregate over all threads of the matched contacts.
  let people: PersonSummary[] = [];
  let groups: GroupSummary[] = [];
  if (matchedEmails.size) {
    const rows = await db.emailThread.findMany({
      where: { accountId: account.id, hidden: false, participants: { some: { contactId: { in: contacts.map((c) => c.id) } } } },
      orderBy: { lastMessageAt: "desc" },
      take: 2000,
    });
    const list = await aggregate(account, rows, "all", "all");
    people = list.people.filter((p) => matchedEmails.has(p.email));
    groups = list.groups.filter((g) => g.members.some((m) => matchedEmails.has(m.email)));
    // Matched contacts without any direct thread still show up (e.g. only in groups so far).
    for (const c of contacts) {
      if (!people.some((p) => p.email === c.email)) people.push(emptyPerson(c, selfIdentity(account).addresses.has(c.email)));
    }
  }

  const seen = new Set<string>();
  const threadRows = [...gmailRows, ...subjectRows].filter((r) => (seen.has(r.gmailThreadId) ? false : (seen.add(r.gmailThreadId), true)));
  const contactIds = (await contactMaps(account.id, threadRows.map((r) => r.counterpartEmail ?? "").filter(Boolean))).ids;
  const threads: Array<ThreadSummary & { conversation: ConversationRef | null }> = threadRows.slice(0, 40).map((r) => ({
    ...threadRowToSummary(r),
    conversation: conversationRefFor(r, contactIds),
  }));

  return { people: people.slice(0, 20), groups: groups.slice(0, 20).map((g) => ({ ...g, title: g.title || groupTitle(g.members) })), threads };
}
