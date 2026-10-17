/**
 * Demo Mode sample mailbox. Everything here is fictional.
 * Shapes mirror what the Gmail sync produces, so the demo exercises the real UI and core logic.
 */
import type { Address } from "@/core/types";
import { makeImage, makePdf, makeText } from "./files";

export const DEMO_ME: Address = { email: "alex@demo.emailto.chat", name: "Alex Rivera" };

export interface DemoAttachment {
  id: string;
  filename: string;
  mimeType: string;
  /** Lazily produce a data: URL (images use <canvas>, so only in the browser). */
  make: () => { dataUrl: string; size: number };
}

export interface DemoMessage {
  id: string;
  threadId: string;
  from: Address;
  to: Address[];
  cc: Address[];
  date: number;
  labels: string[];
  subject: string;
  text: string;
  html?: string;
  hasRemoteImages?: boolean;
  attachments: DemoAttachment[];
}

const anna: Address = { email: "anna.kowalska@kowalska-studio.pl", name: "Anna Kowalska" };
const anna2: Address = { email: "annakowalska88@gmail.com", name: "Anna Kowalska" };
const michael: Address = { email: "michael.brown@northwind.io", name: "Michael Brown" };
const sarah: Address = { email: "sarah@johnson.design", name: "Sarah Johnson" };
const michal: Address = { email: "michal.nowak@northpeak.co", name: "Michał Nowak" };
const emma: Address = { email: "emma.davis@northpeak.co", name: "Emma Davis" };
const tom: Address = { email: "tom.wilson@northpeak.co", name: "Tom Wilson" };
const news: Address = { email: "hello@fieldnotes.news", name: "Fieldnotes Weekly" };

const me = DEMO_ME;

function at(daysAgo: number, hh: number, mm: number, now = new Date()): number {
  const d = new Date(now);
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hh, mm, 0, 0);
  // Keep "today" messages in the past even early in the morning.
  return Math.min(d.getTime(), now.getTime() - (daysAgo === 0 ? 60_000 * (60 - mm) : 0));
}

const pdf = (id: string, filename: string, title: string, lines: string[]): DemoAttachment => ({
  id,
  filename,
  mimeType: "application/pdf",
  make: () => makePdf(title, lines),
});
const img = (id: string, filename: string, seed: number, label: string, hues: [number, number]): DemoAttachment => ({
  id,
  filename,
  mimeType: "image/jpeg",
  make: () => {
    const dataUrl = makeImage(seed, label, hues);
    return { dataUrl, size: Math.round((dataUrl.length * 3) / 4) };
  },
});
const csv = (id: string, filename: string, text: string): DemoAttachment => ({
  id,
  filename,
  mimeType: "text/csv",
  make: () => makeText(text, "text/csv"),
});

type Draft = Omit<DemoMessage, "id" | "threadId" | "labels" | "attachments" | "subject" | "cc"> & {
  cc?: Address[];
  unread?: boolean;
  starred?: boolean;
  archived?: boolean;
  attachments?: DemoAttachment[];
};

function thread(threadId: string, subject: string, msgs: Draft[]): DemoMessage[] {
  return msgs.map((m, i) => {
    const fromMe = m.from.email === me.email;
    const labels = [fromMe ? "SENT" : "INBOX"];
    if (!fromMe && m.archived) labels.splice(labels.indexOf("INBOX"), 1);
    if (m.unread) labels.push("UNREAD");
    if (m.starred) labels.push("STARRED");
    return {
      id: `${threadId}-${i + 1}`,
      threadId,
      subject: i === 0 ? subject : `Re: ${subject}`,
      cc: m.cc ?? [],
      attachments: m.attachments ?? [],
      ...m,
      labels,
    };
  });
}

export function buildDemoMessages(now = new Date()): DemoMessage[] {
  const t = (d: number, h: number, m: number) => at(d, h, m, now);
  return [
    // ── Anna Kowalska · 4 topics ─────────────────────────────────────────────
    ...thread("t-anna-offer", "Oferta współpracy", [
      {
        from: anna,
        to: [me],
        date: t(4, 9, 12),
        text: "Cześć Alex,\n\nczy możesz podesłać ofertę na redesign naszej strony? Zależy nam na starcie w listopadzie — wtedy mamy najmniej zleceń.\n\nPozdrawiam,\nAnna Kowalska\nKowalska Studio · Projektowanie wnętrz\n+48 600 123 456\nkowalska-studio.pl",
      },
      { from: me, to: [anna], date: t(4, 9, 40), text: "Jasne, prześlę ją dzisiaj." },
      { from: anna, to: [me], date: t(4, 9, 42), text: "Super, dzięki!" },
      {
        from: me,
        to: [anna],
        date: t(4, 16, 5),
        text: "Właśnie załączyłem dokument. Są tam trzy etapy, harmonogram i wycena. Daj znać, jeśli coś trzeba doprecyzować.",
        attachments: [
          pdf("a-offer-pdf", "Oferta_Redesign_Kowalska_Studio.pdf", "Oferta: redesign strony Kowalska Studio", [
            "Etap 1 - Warsztat i audyt obecnej strony (1 tydzien)",
            "Etap 2 - Projekt UI: strona glowna, portfolio, kontakt (3 tygodnie)",
            "Etap 3 - Wdrozenie i testy z uzytkownikami (2 tygodnie)",
            "",
            "Wycena calkowita: 24 000 PLN netto",
            "Start: 4 listopada",
          ]),
        ],
      },
      {
        from: anna,
        to: [me],
        date: t(0, 8, 47),
        unread: true,
        text:
          "Wygląda świetnie! Mam tylko jedno pytanie o etap 3 — czy testy z użytkownikami są wliczone w cenę, czy liczymy je osobno?\n\nJeśli wszystko się zgadza, w piątek wyślę podpisaną umowę.\n\nAnna\n\nW dniu " +
          new Date(t(4, 16, 5)).toLocaleDateString("pl-PL") +
          " o 16:05 Alex Rivera <alex@demo.emailto.chat> napisał(a):\n> Właśnie załączyłem dokument. Są tam trzy etapy, harmonogram i wycena.\n> Daj znać, jeśli coś trzeba doprecyzować.",
      },
    ]),
    ...thread("t-anna-invoice", "Faktura za wrzesień", [
      {
        from: anna,
        to: [me],
        date: t(12, 11, 20),
        text: "Hej Alex,\n\nw załączniku faktura za wrzesień (konsultacje + materiały). Termin płatności: 14 dni.\n\nDzięki!\nAnna",
        attachments: [
          pdf("a-inv-pdf", "FV_2026_09_014.pdf", "Faktura VAT FV/2026/09/014", [
            "Sprzedawca: Kowalska Studio",
            "Nabywca: Alex Rivera",
            "Konsultacje projektowe - 12 h x 250 PLN = 3 000 PLN",
            "Materialy i probki - 420 PLN",
            "Razem brutto: 4 206,60 PLN",
          ]),
        ],
      },
      { from: me, to: [anna], date: t(11, 10, 2), text: "Dziękuję, opłacone 👍" },
    ]),
    ...thread("t-anna-meeting", "Spotkanie w czwartek", [
      { from: anna, to: [me], date: t(2, 14, 3), text: "Czy pasuje Ci czwartek o 10:00 u nas w biurze? Pokażę Ci materiały do portfolio." },
      { from: me, to: [anna], date: t(2, 14, 30), text: "Pasuje, do zobaczenia!" },
      {
        from: anna,
        to: [me],
        date: t(2, 14, 34),
        starred: true,
        text: "Świetnie. Adres: ul. Mokotowska 12/4, Warszawa — wejście od podwórza, domofon „Studio”.\n\nKawa będzie czekać ☕",
      },
    ]),
    ...thread("t-anna-photos", "Zdjęcia z warsztatów", [
      {
        from: anna,
        to: [me],
        date: t(20, 18, 15),
        archived: true,
        text: "Obiecane zdjęcia z warsztatów. Możesz wykorzystać je na stronie w sekcji „O nas”.",
        attachments: [
          img("a-ph1", "warsztaty-01.jpg", 3, "Warsztaty · 01", [28, 350]),
          img("a-ph2", "warsztaty-02.jpg", 7, "Warsztaty · 02", [190, 230]),
          img("a-ph3", "warsztaty-03.jpg", 11, "Warsztaty · 03", [140, 90]),
        ],
      },
      { from: me, to: [anna], date: t(20, 19, 2), archived: true, text: "Piękne! Dzięki, Anna." },
    ]),

    // ── A different Anna Kowalska (same name, different address) ────────────
    ...thread("t-anna2-book", "Klub książki — listopad", [
      {
        from: anna2,
        to: [me],
        date: t(8, 20, 41),
        text: "Hej! W listopadzie czytamy „Lalkę”. Spotykamy się 28.11 o 19:00 u mnie. Dasz radę?\n\nAnia",
      },
      { from: me, to: [anna2], date: t(8, 21, 3), text: "Będę! Przyniosę ciasto." },
    ]),

    // ── Michael Brown · 3 topics ────────────────────────────────────────────
    ...thread("t-mb-roadmap", "Q4 roadmap review", [
      {
        from: michael,
        to: [me],
        date: t(1, 10, 15),
        text: `Hi Alex,

Ahead of Thursday's review, here's where I think we landed on the Q4 roadmap. I'd love your take before I share it with the wider team.

Priorities
- Self-serve onboarding: cut time-to-first-value from 3 days to under 1 hour.
- Usage-based billing: ship to 10% of accounts behind a flag, then ramp.
- EU data residency: required for two enterprise deals in the pipeline.

What we're not doing this quarter
- The mobile app rewrite. We'll revisit in January once onboarding data is in.
- Custom dashboards. The demand is real, but it's concentrated in three accounts.

Risks
1. Billing touches every service — we need an owner on the platform team by next week.
2. Data residency depends on the infrastructure contract being signed by mid-November.
3. Onboarding needs design capacity we currently don't have; we may need a contractor.

Open questions for you
- Are you comfortable owning the onboarding metrics?
- Should we move the pricing page refresh into Q4 or keep it for Q1?

No need for a long reply — a quick gut check is plenty.

Best,
Michael

--
Michael Brown
VP Product, Northwind
+1 415 555 0142`,
      },
      {
        from: me,
        to: [michael],
        date: t(1, 13, 2),
        text: "Thanks Michael — this is a great summary. Happy to own the onboarding metrics. I'd keep the pricing page in Q1; billing will change the story anyway.\n\nOne thought on risk #3: Sarah Johnson might have capacity in November, I'll ask her.",
      },
      { from: michael, to: [me], date: t(0, 9, 31), unread: true, text: "Perfect, that works. Please do loop in Sarah — I'll hold a slot for her in the plan." },
      { from: michael, to: [me], date: t(0, 9, 33), unread: true, text: "Also: the review moved to 11:00 on Thursday." },
    ]),
    ...thread("t-mb-contract", "Contract renewal", [
      {
        from: michael,
        to: [me],
        date: t(9, 15, 48),
        text: "Hi Alex,\n\nAttached are the renewed MSA and the updated pricing sheet for 2026. The main change is the volume discount tier above 50 seats.\n\nLet me know if legal has any comments.\n\nBest regards,\nMichael",
        attachments: [
          pdf("m-msa", "Northwind_MSA_2026.pdf", "Master Services Agreement 2026", [
            "Between Northwind Inc. and Northpeak Co.",
            "Term: 12 months from January 1, 2026",
            "Volume discount: 15% above 50 seats",
            "Payment terms: net 30",
          ]),
          csv("m-pricing", "pricing-2026.csv", "tier,seats,price_per_seat_eur\nStarter,1-10,29\nTeam,11-50,24\nScale,51+,20.40\n"),
        ],
      },
      { from: me, to: [michael], date: t(8, 11, 20), text: "Thanks! Legal asked whether the 15% discount also applies to seats added mid-term." },
      {
        from: michael,
        to: [me],
        date: t(8, 12, 5),
        text: "Yes — any seats added during the term are billed at the tier you're in at that moment, pro-rated. I'll add a sentence to clause 4.2 to make it explicit.",
      },
    ]),
    ...thread("t-mb-lunch", "Lunch next week?", [
      { from: michael, to: [me], date: t(5, 12, 10), text: "Lunch next week? I'm in Warsaw Tuesday to Thursday." },
      { from: me, to: [michael], date: t(5, 12, 44), text: "Wednesday works! There's a great ramen place near the office." },
      { from: michael, to: [me], date: t(5, 12, 50), text: "Ramen it is 🍜" },
    ]),

    // ── Sarah Johnson · 2 topics ────────────────────────────────────────────
    ...thread("t-sj-brand", "Brand refresh — first concepts", [
      {
        from: sarah,
        to: [me],
        date: t(3, 17, 22),
        text: "Hi Alex!\n\nHere are the first three directions for the brand refresh, plus the moodboard. My favourite is B — it keeps the recognisable blue but feels much lighter.\n\nTake your time, no rush.\n\nSarah",
        attachments: [
          img("s-c1", "concept-A.jpg", 21, "Concept A — Editorial", [215, 260]),
          img("s-c2", "concept-B.jpg", 25, "Concept B — Light blue", [205, 225]),
          img("s-c3", "concept-C.jpg", 29, "Concept C — Warm", [20, 45]),
          img("s-mood", "moodboard.jpg", 33, "Moodboard", [300, 190]),
        ],
      },
      { from: me, to: [sarah], date: t(2, 9, 5), text: "Love concept B. Could you try it with a slightly warmer neutral for the backgrounds?" },
      { from: sarah, to: [me], date: t(2, 10, 40), text: "Great call. I'll develop B further and send an update on Monday." },
    ]),
    ...thread("t-sj-invoice", "Invoice #2026-118", [
      {
        from: sarah,
        to: [me],
        date: t(15, 9, 0),
        archived: true,
        text: "Hi Alex, please find attached the invoice for the October discovery sprint. Thank you!",
        attachments: [pdf("s-inv", "Invoice-2026-118.pdf", "Invoice #2026-118", ["Discovery sprint - October", "5 days x 900 EUR", "Total: 4 500 EUR", "Due: net 14"])],
      },
      { from: me, to: [sarah], date: t(14, 8, 12), archived: true, text: "Paid, thanks Sarah!" },
    ]),

    // ── Team Product · group of 4 (me + Emma, Michał, Tom) ──────────────────
    ...thread("t-team-sprint", "Sprint 42 planning", [
      {
        from: emma,
        to: [me, michal, tom],
        date: t(0, 8, 2),
        text: "Morning team! Agenda for today's planning:\n\n1. Carry-over from sprint 41\n2. Onboarding flow v2\n3. Gmail sync performance\n4. Release v2.3 date\n\nPlease add anything I missed.",
      },
      { from: michal, to: [emma], cc: [me, tom], date: t(0, 8, 14), text: "I can take the onboarding flow v2. Designs are ready since Friday." },
      { from: tom, to: [emma], cc: [me, michal], date: t(0, 8, 21), text: "Backend for incremental sync is ready for review. Initial sync is ~3× faster on large mailboxes." },
      { from: me, to: [emma, michal, tom], date: t(0, 8, 30), text: "Great progress! Let's target Thursday for v2.3 if review goes well." },
      {
        from: emma,
        to: [me, michal, tom],
        date: t(0, 9, 5),
        unread: true,
        text: "Perfect. Notes attached — v2.3 is planned for Thursday.",
        attachments: [pdf("g-notes", "sprint-42-notes.pdf", "Sprint 42 - planning notes", ["Onboarding v2 - Michal", "Sync performance review - Tom", "Release v2.3 - Thursday", "Retro - Friday 15:00"])],
      },
    ]),
    ...thread("t-team-release", "Release notes v2.3", [
      {
        from: tom,
        to: [me, emma, michal],
        date: t(6, 16, 30),
        text: "Draft release notes for v2.3 below — edits welcome.\n\n• Faster initial sync\n• Attachments panel with filters\n• Dark mode polish\n• Fix: drafts sometimes not saved on mobile",
      },
      { from: emma, to: [tom], cc: [me, michal], date: t(6, 17, 2), text: "Looks good. Let's call it “Attachments, now in one place”." },
    ]),

    // ── An HTML newsletter (remote images blocked by default) ───────────────
    ...thread("t-news", "This week: the quiet power of plain text", [
      {
        from: news,
        to: [me],
        date: t(1, 7, 0),
        unread: true,
        archived: false,
        text: "",
        hasRemoteImages: true,
        html: `<div style="max-width:560px;margin:0 auto;font-family:Georgia,serif;color:#1f2328">
<p style="font:12px Arial,sans-serif;color:#6b7280;letter-spacing:.08em;text-transform:uppercase">Fieldnotes Weekly · Issue 112</p>
<h1 style="font-size:26px;line-height:1.25;margin:8px 0 16px">The quiet power of plain text</h1>
<img data-remote-src="https://images.example.invalid/hero.jpg" alt="[Remote image blocked]" style="width:100%;height:auto;border-radius:8px;background:#eef0f3;min-height:120px">
<p style="font-size:16px;line-height:1.6">Every tool we love eventually tries to become a platform. This week we look at three teams that went the other way — and shipped faster because of it.</p>
<ul style="font-size:16px;line-height:1.6"><li>Why the best specs fit on one screen</li><li>Writing changelogs people actually read</li><li>The 15-minute weekly review</li></ul>
<p style="font-size:16px;line-height:1.6"><a href="https://example.com/issue-112">Read the full issue →</a></p>
<p style="font:12px Arial,sans-serif;color:#6b7280">You're receiving this because you subscribed at fieldnotes.news. <a href="https://example.com/unsubscribe" style="color:#6b7280">Unsubscribe</a></p>
<img data-remote-src="https://track.example.invalid/open.gif" width="1" height="1" alt="">
</div>`,
      },
    ]),
  ];
}

export { makePdf };
