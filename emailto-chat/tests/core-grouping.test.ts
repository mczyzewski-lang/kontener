import { describe, expect, it } from "vitest";
import { parseAddressList } from "@/core/addresses";
import {
  aggregateConversations,
  analyzeMessages,
  cleanSubject,
  groupKeyFor,
  makeSelf,
  threadsForGroup,
  threadsForPerson,
  type IndexableMessage,
} from "@/core/grouping";
import { splitQuotedText } from "@/core/quotes";

const ME = "me@example.com";
const self = makeSelf(ME, ["me.alias@example.org"]);
const contactId = (e: string) => `c:${e}`;

let seq = 0;
function msg(p: Partial<Omit<IndexableMessage, "from" | "to" | "cc">> & { threadId: string; from: string; to: string[]; cc?: string[] }): IndexableMessage {
  seq++;
  const fromMe = [ME, "me.alias@example.org"].includes(p.from);
  return {
    id: `m${seq}`,
    threadId: p.threadId,
    from: { email: p.from, name: null },
    to: p.to.map((email) => ({ email, name: null })),
    cc: (p.cc ?? []).map((email) => ({ email, name: null })),
    bcc: p.bcc ?? [],
    date: p.date ?? 1_700_000_000_000 + seq * 60_000,
    labelIds: p.labelIds ?? (fromMe ? ["SENT"] : ["INBOX"]),
    snippet: p.snippet ?? `snippet ${seq}`,
    subject: p.subject ?? "Subject",
    hasAttachments: p.hasAttachments ?? false,
  };
}

const list = (messages: IndexableMessage[], mailbox: "inbox" | "all" | "archive" | "sent" = "all", filter: "all" | "unread" = "all") =>
  aggregateConversations(analyzeMessages(messages, self), { mailbox, filter, contactId, self });

describe("person-first grouping", () => {
  it("20 messages from one person in 5 threads → one person, 5 topics", () => {
    const messages: IndexableMessage[] = [];
    for (let t = 0; t < 5; t++) for (let i = 0; i < 4; i++) messages.push(msg({ threadId: `t${t}`, from: "anna@x.com", to: [ME], subject: `Topic ${t}` }));
    const { people, groups } = list(messages);
    expect(people).toHaveLength(1);
    expect(groups).toHaveLength(0);
    expect(people[0].email).toBe("anna@x.com");
    expect(people[0].threadCount).toBe(5);
    expect(threadsForPerson(analyzeMessages(messages, self), "anna@x.com")).toHaveLength(5);
  });

  it("one e-mail to 4 recipients → a group conversation with every participant", () => {
    const m = msg({ threadId: "g1", from: ME, to: ["a@x.com", "b@x.com"], cc: ["c@x.com", "d@x.com"], subject: "Kickoff" });
    const { people, groups } = list([m]);
    expect(people).toHaveLength(0);
    expect(groups).toHaveLength(1);
    expect(groups[0].members.map((x) => x.email)).toEqual(["a@x.com", "b@x.com", "c@x.com", "d@x.com"]);
    expect(groups[0].id).toBe(groupKeyFor(["d@x.com", "c@x.com", "b@x.com", "a@x.com"]));
    expect(groups[0].title).toBe("A, B + 2");
  });

  it("group threads stay reachable from each member's person view without duplicating the thread", () => {
    const threads = analyzeMessages(
      [msg({ threadId: "g1", from: "a@x.com", to: [ME, "b@x.com"] }), msg({ threadId: "d1", from: "a@x.com", to: [ME] })],
      self,
    );
    const forA = threadsForPerson(threads, "a@x.com").map((t) => t.threadId);
    const forB = threadsForPerson(threads, "b@x.com").map((t) => t.threadId);
    expect(forA.sort()).toEqual(["d1", "g1"]);
    expect(forB).toEqual(["g1"]);
    expect(threads.filter((t) => t.threadId === "g1")).toHaveLength(1);
  });

  it("different recipient sets are different groups; same set across threads is one group", () => {
    const threads = analyzeMessages(
      [
        msg({ threadId: "g1", from: ME, to: ["a@x.com", "b@x.com"] }),
        msg({ threadId: "g2", from: "b@x.com", to: [ME, "a@x.com"] }),
        msg({ threadId: "g3", from: ME, to: ["a@x.com", "c@x.com"] }),
      ],
      self,
    );
    const { groups } = aggregateConversations(threads, { mailbox: "all", filter: "all", contactId, self });
    expect(groups).toHaveLength(2);
    const ab = groups.find((g) => g.members.length === 2 && g.members.some((m) => m.email === "b@x.com"))!;
    expect(threadsForGroup(threads, ab.id).map((t) => t.threadId).sort()).toEqual(["g1", "g2"]);
  });

  it("a new topic with the same person is a separate thread (never merged by subject)", () => {
    const { people } = list([
      msg({ threadId: "t1", from: "anna@x.com", to: [ME], subject: "Invoice" }),
      msg({ threadId: "t2", from: ME, to: ["anna@x.com"], subject: "Invoice" }),
    ]);
    expect(people).toHaveLength(1);
    expect(people[0].threadCount).toBe(2);
  });

  it("two contacts with the same display name but different addresses stay separate", () => {
    const a = msg({ threadId: "t1", from: "anna@work.com", to: [ME] });
    const b = msg({ threadId: "t2", from: "anna88@gmail.com", to: [ME] });
    a.from!.name = "Anna Kowalska";
    b.from!.name = "Anna Kowalska";
    const { people } = list([a, b]);
    expect(people.map((p) => p.email).sort()).toEqual(["anna88@gmail.com", "anna@work.com"]);
    expect(people.every((p) => p.name === "Anna Kowalska")).toBe(true);
  });

  it("people I only wrote to appear in the list (sent-only contacts)", () => {
    const { people } = list([msg({ threadId: "t1", from: ME, to: ["new@x.com"] })], "all");
    expect(people.map((p) => p.email)).toEqual(["new@x.com"]);
    expect(list([msg({ threadId: "t1", from: ME, to: ["new@x.com"] })], "sent").people).toHaveLength(1);
  });

  it("recognises my aliases and the SENT label as me", () => {
    const fromAlias = msg({ threadId: "t1", from: "me.alias@example.org", to: ["bob@x.com"] });
    const fromUnknownButSent = msg({ threadId: "t2", from: "old-me@legacy.com", to: ["bob@x.com"], labelIds: ["SENT"] });
    const threads = analyzeMessages([fromAlias, fromUnknownButSent], self);
    expect(threads.every((t) => t.counterpart === "bob@x.com" && t.lastFromMe)).toBe(true);
  });

  it("archiving one topic removes only that thread from the inbox view", () => {
    const messages = [
      msg({ threadId: "t1", from: "anna@x.com", to: [ME] }),
      msg({ threadId: "t2", from: "anna@x.com", to: [ME] }),
      msg({ threadId: "t3", from: "anna@x.com", to: [ME] }),
    ];
    messages[0].labelIds = []; // t1 archived (INBOX removed)
    const inbox = list(messages, "inbox");
    expect(inbox.people[0].threadCount).toBe(2);
    const all = list(messages, "all");
    expect(all.people[0].threadCount).toBe(3);
    expect(list(messages, "archive").people[0].threadCount).toBe(1);
  });

  it("unread count of a person is the aggregate of their direct threads", () => {
    const messages = [
      msg({ threadId: "t1", from: "anna@x.com", to: [ME], labelIds: ["INBOX", "UNREAD"] }),
      msg({ threadId: "t1", from: "anna@x.com", to: [ME], labelIds: ["INBOX", "UNREAD"] }),
      msg({ threadId: "t2", from: "anna@x.com", to: [ME], labelIds: ["INBOX"] }),
      msg({ threadId: "g", from: "anna@x.com", to: [ME, "b@x.com"], labelIds: ["INBOX", "UNREAD"] }),
    ];
    const { people, groups } = list(messages);
    expect(people[0].unreadCount).toBe(2); // group unread is counted on the group, not twice
    expect(groups[0].unreadCount).toBe(1);
    expect(list(messages, "all", "unread").people).toHaveLength(1);
    messages.forEach((m) => (m.labelIds = m.labelIds.filter((l) => l !== "UNREAD")));
    expect(list(messages, "all", "unread").people).toHaveLength(0);
  });

  it("trash and spam threads are hidden everywhere", () => {
    const { people } = list([msg({ threadId: "t1", from: "spam@x.com", to: [ME], labelIds: ["SPAM"] })]);
    expect(people).toHaveLength(0);
  });

  it("ignores Bcc when deciding who is in the conversation", () => {
    const { people, groups } = list([msg({ threadId: "t1", from: ME, to: ["a@x.com"], bcc: [{ email: "boss@x.com" }] })]);
    expect(groups).toHaveLength(0);
    expect(people.map((p) => p.email)).toEqual(["a@x.com"]);
  });

  it("orders people by most recent activity", () => {
    const { people } = list([
      msg({ threadId: "t1", from: "old@x.com", to: [ME], date: 1000 }),
      msg({ threadId: "t2", from: "new@x.com", to: [ME], date: 5000 }),
      msg({ threadId: "t3", from: "mid@x.com", to: [ME], date: 3000 }),
    ]);
    expect(people.map((p) => p.email)).toEqual(["new@x.com", "mid@x.com", "old@x.com"]);
  });

  it("cleans reply/forward prefixes for display only", () => {
    expect(cleanSubject("Re: Fwd: RE: Odp: Offer")).toBe("Offer");
    expect(cleanSubject("")).toBe("(no subject)");
  });
});

describe("address parsing", () => {
  it("parses quoted names, encoded words, groups and duplicates", () => {
    const list = parseAddressList('"Kowalska, Anna" <Anna@X.com>, =?UTF-8?B?TWljaGHFgg==?= <michal@x.com>, undisclosed-recipients:;, anna@x.com, bob@x.com (Bob)');
    expect(list).toEqual([
      { email: "anna@x.com", name: "Kowalska, Anna" },
      { email: "michal@x.com", name: "Michał" },
      { email: "bob@x.com", name: "Bob" },
    ]);
  });
});

describe("quoted text and signatures", () => {
  it("collapses Gmail-style quotes and keeps the new text", () => {
    const r = splitQuotedText("Thanks, works!\n\nOn Mon, 5 Oct 2026 at 10:00, Anna <anna@x.com> wrote:\n> Here it is\n> Anna");
    expect(r.text).toBe("Thanks, works!");
    expect(r.quotedText).toContain("> Here it is");
  });

  it("handles Polish attribution lines", () => {
    const r = splitQuotedText("Super!\n\nW dniu 05.10.2026 o 10:00 Anna <anna@x.com> napisał(a):\n> Cześć");
    expect(r.text).toBe("Super!");
    expect(r.quotedText).toMatch(/^W dniu/);
  });

  it("detects the RFC 3676 signature delimiter without deleting it", () => {
    const r = splitQuotedText("See you then.\n\n-- \nMichael Brown\nVP Product");
    expect(r.text).toBe("See you then.");
    expect(r.signature).toContain("Michael Brown");
  });

  it("never returns an empty body", () => {
    const r = splitQuotedText("> only a quote\n> here");
    expect(r.text).toContain("only a quote");
  });
});
