import { Archive, ArrowRight, AtSign, FileText, Image as ImageIcon, Inbox, Lock, Mail, Paperclip, Send, ShieldCheck, Star, Trash2, Users } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { EmbeddedDemo } from "@/components/landing/embedded-demo";
import { GoogleMark } from "@/components/landing/google-button";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

const FAQ: [string, string][] = [
  [
    "Do the people I write to need emailto.chat?",
    "No. They receive a completely normal e-mail in Gmail, Outlook, Apple Mail or anything else. emailto.chat only changes how you see and write your mail.",
  ],
  [
    "Is this a new e-mail address or a new mailbox?",
    "No. You keep your Gmail address, your history, your labels and your Sent folder. Everything you send from emailto.chat appears in Gmail, and everything you do in Gmail shows up here after the next sync.",
  ],
  [
    "How are conversations grouped?",
    "By the exact e-mail address of each person — never just by name, so two different “Anna Kowalska” addresses stay separate. Each Gmail thread with that person becomes a topic tab. Threads with several people become group chats.",
  ],
  [
    "Is it real-time like a messenger?",
    "It’s e-mail with a messenger interface. New mail usually appears within seconds to a minute, but e-mail delivery and sync can be delayed — we don’t fake typing indicators or read receipts.",
  ],
  [
    "What does emailto.chat store?",
    "Only a minimal index needed to group your mail by person: addresses and names, subjects, short snippets, Gmail labels and attachment names. Message bodies and files are fetched from Gmail when you open them. You can disconnect Gmail or delete everything at any time.",
  ],
  [
    "Which Gmail permission do you ask for — and why?",
    "One scope: gmail.modify. It lets the app read your mail, send replies, save drafts and mark messages read, starred or archived. It does not allow permanently deleting mail. We don’t request full mailbox access (mail.google.com).",
  ],
  ["Does it work on my phone?", "Yes. emailto.chat is designed mobile-first and can be installed to your home screen as an app (PWA)."],
  ["Can I try it without connecting Gmail?", "Yes — the demo uses sample conversations and runs entirely in your browser."],
];

export default async function LandingPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  return (
    <div className="min-h-dvh bg-bg">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-bg/80 backdrop-blur-lg">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5">
          <Link href="/" aria-label="emailto.chat home">
            <Logo className="h-7" />
          </Link>
          <div className="hidden items-center gap-7 text-sm text-fg-muted md:flex">
            <a href="#how" className="hover:text-fg">How it works</a>
            <a href="#security" className="hover:text-fg">Privacy & security</a>
            <a href="#faq" className="hover:text-fg">FAQ</a>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <Link href="/demo">Try demo</Link>
            </Button>
            <Button asChild size="sm">
              <a href="/api/auth/google/login">Connect Gmail</a>
            </Button>
          </div>
        </nav>
      </header>

      {params.auth_error && (
        <div className="mx-auto mt-4 max-w-xl rounded-xl bg-danger-soft px-4 py-3 text-center text-sm" role="alert">
          {params.auth_error === "access_denied" ? "Sign-in was cancelled." : "We couldn’t sign you in with Google. Please try again."}
        </div>
      )}
      {params.deleted && (
        <div className="mx-auto mt-4 max-w-xl rounded-xl bg-subtle px-4 py-3 text-center text-sm" role="status">
          Your account and all stored data were deleted, and Gmail access was revoked.
        </div>
      )}

      <main>
        {/* HERO */}
        <section className="relative overflow-hidden">
          <div className="mx-auto max-w-6xl px-5 pb-10 pt-16 text-center md:pt-24">
            <p className="mx-auto mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-panel px-3 py-1 text-xs font-medium text-fg-muted shadow-sm">
              <span className="size-1.5 rounded-full bg-accent" /> A person-first Gmail client
            </p>
            <h1 className="mx-auto max-w-3xl text-balance text-[42px] font-semibold leading-[1.05] tracking-[-0.035em] md:text-7xl">
              Your email.
              <br />
              <span className="text-accent">Now a conversation.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-pretty text-lg text-fg-muted md:text-xl">Turn your Gmail into a chat app. People first. Threads second. Messages naturally.</p>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button asChild size="xl" className="w-full sm:w-auto">
                <a href="/api/auth/google/login">
                  <span className="grid size-6 place-items-center rounded-full bg-white">
                    <GoogleMark className="size-4" />
                  </span>
                  Connect Gmail — Get started
                </a>
              </Button>
              <Button asChild size="xl" variant="outline" className="w-full sm:w-auto">
                <Link href="/demo">
                  Try the live demo <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>
            <p className="mt-4 text-xs text-fg-subtle">Free while in beta · Works with any Gmail or Google Workspace account · No new address</p>
          </div>

          <div className="mx-auto max-w-6xl px-3 pb-20 md:px-5">
            <div className="overflow-hidden rounded-[22px] border border-border bg-panel shadow-lg">
              <div className="flex items-center gap-2 border-b border-border bg-subtle px-4 py-2.5">
                <span className="flex gap-1.5" aria-hidden>
                  <span className="size-3 rounded-full bg-[#ff5f57]" />
                  <span className="size-3 rounded-full bg-[#febc2e]" />
                  <span className="size-3 rounded-full bg-[#28c840]" />
                </span>
                <span className="mx-auto flex items-center gap-1.5 rounded-md bg-bg px-3 py-0.5 text-xs text-fg-muted">
                  <Lock className="size-3" /> emailto.chat
                </span>
                <span className="text-[11px] font-medium text-fg-subtle">Live demo — click around</span>
              </div>
              <div className="h-[640px] md:h-[680px]">
                <EmbeddedDemo />
              </div>
            </div>
          </div>
        </section>

        {/* EMAIL, BUT HUMAN */}
        <section id="how" className="border-t border-border bg-subtle py-20 md:py-28">
          <div className="mx-auto max-w-6xl px-5">
            <SectionTitle eyebrow="Email, but human." title="Stop opening e-mails. Start talking to people." text="Traditional inboxes show you a pile of subject lines. emailto.chat shows you the people behind them — and the conversation you’re having." />
            <div className="mt-14 grid gap-6 md:grid-cols-2">
              <div className="rounded-2xl border border-border bg-panel p-5">
                <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-fg-subtle">Traditional inbox</p>
                <ul className="divide-y divide-border text-sm">
                  {[
                    ["Anna Kowalska", "Re: Re: Oferta współpracy", "Wygląda świetnie! Mam tylko jedno…"],
                    ["Michael Brown", "Re: Q4 roadmap review", "Also: the review moved to 11:00…"],
                    ["Anna Kowalska", "Faktura za wrzesień", "W załączniku faktura za wrzesień…"],
                    ["Emma Davis", "Re: Sprint 42 planning", "Perfect. Notes attached — v2.3…"],
                    ["Anna Kowalska", "Spotkanie w czwartek", "Świetnie. Adres: ul. Mokotowska…"],
                    ["Michael Brown", "Contract renewal", "Attached are the renewed MSA…"],
                  ].map(([from, subject, snippet], i) => (
                    <li key={i} className="flex items-center gap-3 py-2.5">
                      <span className="size-3.5 shrink-0 rounded border border-border-strong" />
                      <Star className="size-3.5 shrink-0 text-fg-subtle" />
                      <span className="w-28 shrink-0 truncate font-medium">{from}</span>
                      <span className="truncate text-fg-muted">
                        <span className="text-fg">{subject}</span> — {snippet}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-2xl border border-accent/30 bg-panel p-5 shadow-md">
                <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-accent">emailto.chat</p>
                <ul className="space-y-1 text-sm">
                  {[
                    ["Anna Kowalska", "anna.kowalska@kowalska-studio.pl", "Wygląda świetnie! Mam tylko jedno pytanie…", 1, "4 topics"],
                    ["Michael Brown", "michael.brown@northwind.io", "Also: the review moved to 11:00 on Thursday.", 2, "3 topics"],
                    ["Team Product", "emma.davis@northpeak.co", "Emma: Perfect. Notes attached — v2.3…", 1, "group · 2 topics"],
                  ].map(([name, email, snippet, unread, meta]) => (
                    <li key={String(name)} className="flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-hover">
                      <Avatar email={String(email)} name={String(name)} size="lg" />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between">
                          <span className="font-semibold">{name}</span>
                          <span className="text-[11px] text-fg-subtle">{meta}</span>
                        </span>
                        <span className="block truncate text-fg-muted">{snippet}</span>
                      </span>
                      <span className="grid size-5 place-items-center rounded-full bg-accent text-[11px] font-semibold text-white">{unread}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-4 text-[13px] text-fg-muted">Six e-mails, three conversations. Each person appears once, no matter how many threads you share.</p>
              </div>
            </div>
          </div>
        </section>

        {/* FEATURE ROWS */}
        <section className="py-20 md:py-28">
          <div className="mx-auto grid max-w-6xl gap-24 px-5">
            <FeatureRow
              eyebrow="One person. Every conversation."
              title="Every topic with someone, as a tab."
              text="Click a person and see every thread you share — the offer, the invoice, the meeting — as tabs. Switch topics in one click. Start a new topic and it becomes a brand-new e-mail thread, never glued onto an old one."
              visual={
                <div className="rounded-2xl border border-border bg-panel p-4 shadow-md">
                  <div className="flex items-center gap-3 border-b border-border pb-3">
                    <Avatar email="anna.kowalska@kowalska-studio.pl" name="Anna Kowalska" />
                    <div>
                      <p className="text-sm font-semibold">Anna Kowalska</p>
                      <p className="text-xs text-fg-muted">anna.kowalska@kowalska-studio.pl</p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5 text-[13px]">
                    <span className="rounded-lg bg-active px-3 py-1.5 font-medium text-accent">Oferta współpracy</span>
                    <span className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-fg-muted">
                      Faktura za wrzesień
                    </span>
                    <span className="rounded-lg px-3 py-1.5 text-fg-muted">Spotkanie w czwartek</span>
                    <span className="rounded-lg px-3 py-1.5 text-fg-muted">Zdjęcia z warsztatów</span>
                    <span className="rounded-lg px-2.5 py-1.5 text-fg-subtle">+ New topic</span>
                  </div>
                </div>
              }
            />
            <FeatureRow
              reverse
              eyebrow="Your email, in chat bubbles."
              title="Read and reply like you’re texting."
              text="Short e-mails become bubbles. Long ones become readable cards with “Read more”. Quoted history and signatures fold away. Reply right under the conversation — the answer goes out as a proper e-mail in the right Gmail thread."
              visual={
                <div className="space-y-1.5 rounded-2xl border border-border bg-panel p-5 shadow-md">
                  <Bubble>Cześć, czy możesz podesłać ofertę?</Bubble>
                  <Bubble mine>Jasne, prześlę ją dzisiaj.</Bubble>
                  <Bubble>Super, dzięki!</Bubble>
                  <Bubble mine>
                    Właśnie załączyłem dokument.
                    <span className="mt-2 flex items-center gap-2 rounded-lg bg-white/15 p-2 text-xs">
                      <FileText className="size-4" /> Oferta_Redesign.pdf
                    </span>
                  </Bubble>
                  <div className="mt-4 flex items-center gap-2 rounded-full bg-muted px-4 py-2.5 text-sm text-fg-subtle">
                    <Paperclip className="size-4 text-accent" /> Write a message...
                    <Send className="ml-auto size-4 text-accent" />
                  </div>
                </div>
              }
            />
            <FeatureRow
              eyebrow="Everything you shared, in one place."
              title="Every file, right next to the person."
              text="PDFs, photos, spreadsheets — everything you exchanged with someone is collected in their details panel. Filter by images or documents, switch between this topic and all conversations, and jump to the e-mail a file came from."
              visual={
                <div className="rounded-2xl border border-border bg-panel p-4 shadow-md">
                  <div className="mb-3 flex gap-1.5 text-xs">
                    {["All 9", "Images 4", "Documents 5", "Other 0"].map((l, i) => (
                      <span key={l} className={i === 0 ? "rounded-full border border-accent bg-accent-soft px-2.5 py-0.5 font-medium text-accent" : "rounded-full border border-border px-2.5 py-0.5 text-fg-muted"}>
                        {l}
                      </span>
                    ))}
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[[205, 230], [20, 45], [300, 190], [140, 90]].map(([a, b], i) => (
                      <div key={i} className="aspect-square rounded-lg" style={{ background: `linear-gradient(135deg, hsl(${a} 70% 62%), hsl(${b} 65% 42%))` }}>
                        <ImageIcon className="m-2 size-4 text-white/80" />
                      </div>
                    ))}
                    {["PDF", "PDF"].map((e, i) => (
                      <div key={i} className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-border">
                        <span className="grid size-9 place-items-center rounded-lg bg-[#fde8e8] text-[10px] font-bold text-[#c2410c]">{e}</span>
                        <span className="text-[10px] text-fg-muted">{i ? "Invoice.pdf" : "Offer.pdf"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              }
            />
            <FeatureRow
              reverse
              eyebrow="Group conversations."
              title="Threads with many people feel like group chats."
              text="Every sender gets their own color and avatar, your messages stay on the right, and you always see who’s in To and Cc before you hit send. Groups are built from the real participants of real threads."
              visual={
                <div className="space-y-2 rounded-2xl border border-border bg-panel p-5 shadow-md">
                  <p className="flex items-center gap-1.5 text-xs font-medium text-fg-muted">
                    <Users className="size-3.5" /> Emma, Michał, Tom · Sprint 42 planning
                  </p>
                  <GroupLine name="Emma" color="text-[#be185d]" email="emma.davis@northpeak.co" text="Agenda for today’s planning is up." />
                  <GroupLine name="Michał" color="text-[#047857]" email="michal.nowak@northpeak.co" text="I can take the onboarding flow v2." />
                  <GroupLine name="Tom" color="text-[#6d28d9]" email="tom.wilson@northpeak.co" text="Incremental sync is ready for review." />
                  <Bubble mine>Great progress! Let’s target Thursday.</Bubble>
                </div>
              }
            />
          </div>
        </section>

        {/* STILL GMAIL */}
        <section className="border-y border-border bg-subtle py-20 md:py-28">
          <div className="mx-auto max-w-6xl px-5">
            <SectionTitle eyebrow="Still Gmail. Just better." title="Nothing to migrate. Nothing to lose." text="emailto.chat is a new way to use the Gmail you already have. Gmail stays the source of truth." />
            <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                [AtSign, "Same address", "You send from your own Gmail address (and your send-as aliases)."],
                [Send, "Sent folder intact", "Every message you send here appears in Gmail’s Sent, in the right thread."],
                [Inbox, "Two-way sync", "Read, archive or star in Gmail — emailto.chat follows, and vice versa."],
                [Mail, "Regular e-mail", "Recipients get a normal e-mail. They never need to install anything."],
              ].map(([Icon, title, text]) => {
                const I = Icon as typeof AtSign;
                return (
                  <div key={String(title)} className="rounded-2xl border border-border bg-panel p-5">
                    <I className="size-5 text-accent" />
                    <p className="mt-3 font-semibold">{String(title)}</p>
                    <p className="mt-1 text-sm text-fg-muted">{String(text)}</p>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              {[
                [Archive, "Archive one topic, not a person", "Archiving affects one thread only — the rest of your history with them stays put."],
                [Trash2, "No hidden deletes", "We can’t permanently delete your mail — the permission we use doesn’t allow it."],
                [Star, "Stars, drafts, unread", "Stars, drafts and read state map to Gmail’s own labels and drafts."],
              ].map(([Icon, title, text]) => {
                const I = Icon as typeof AtSign;
                return (
                  <div key={String(title)} className="flex gap-3 rounded-2xl border border-border bg-panel p-5">
                    <I className="mt-0.5 size-5 shrink-0 text-accent" />
                    <div>
                      <p className="font-semibold">{String(title)}</p>
                      <p className="mt-1 text-sm text-fg-muted">{String(text)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* SECURITY */}
        <section id="security" className="py-20 md:py-28">
          <div className="mx-auto max-w-6xl px-5">
            <SectionTitle eyebrow="Privacy & security" title="Your inbox is private. We built it that way." text="You’re trusting us with your correspondence. Here is exactly what we do — no vague promises, no badges we haven’t earned." />
            <div className="mt-14 grid gap-x-10 gap-y-8 md:grid-cols-2">
              {[
                ["Sign in with Google (OAuth 2.0)", "We never see your Google password. Gmail access is a separate, explicit consent step that you can revoke at any time — in our settings or in your Google Account."],
                ["One Gmail permission, not full control", "We request gmail.modify: read, send, draft and label. Not https://mail.google.com/ (full access including permanent deletion)."],
                ["Minimal data, encrypted tokens", "We store only an index (people, subjects, snippets, labels, attachment names). Bodies and files are fetched from Gmail on demand. OAuth tokens are encrypted at rest and never reach your browser."],
                ["Safe rendering", "HTML e-mails are sanitized and shown in a sandbox without scripts. Remote images — often used as tracking pixels — are blocked until you choose to load them."],
                ["No ads. No profiling. No AI training.", "Your mail is used only to show it to you and to send what you write. We never sell it, use it for advertising, or use it to train AI models."],
                ["Leave any time", "Disconnect Gmail to revoke access and delete the index, or delete your account and all stored data with one click."],
              ].map(([t, d]) => (
                <div key={t} className="flex gap-4">
                  <ShieldCheck className="mt-0.5 size-5 shrink-0 text-accent" />
                  <div>
                    <p className="font-semibold">{t}</p>
                    <p className="mt-1 text-[15px] text-fg-muted">{d}</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-12 rounded-2xl bg-subtle p-5 text-sm text-fg-muted">
              emailto.chat’s use and transfer of information received from Google APIs to any other app will adhere to the{" "}
              <a href="https://developers.google.com/terms/api-services-user-data-policy" className="text-accent underline-offset-2 hover:underline" target="_blank" rel="noopener noreferrer">
                Google API Services User Data Policy
              </a>
              , including the Limited Use requirements. Read our <Link href="/privacy" className="text-accent hover:underline">Privacy Policy</Link>. emailto.chat is an independent product and is not affiliated with Google.
            </p>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="border-t border-border bg-subtle py-20 md:py-28">
          <div className="mx-auto max-w-3xl px-5">
            <SectionTitle eyebrow="FAQ" title="Questions, answered." />
            <div className="mt-10 divide-y divide-border rounded-2xl border border-border bg-panel">
              {FAQ.map(([q, a]) => (
                <details key={q} className="group px-5 py-4 [&_summary::-webkit-details-marker]:hidden">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                    {q}
                    <span className="text-xl leading-none text-fg-subtle transition-transform group-open:rotate-45">+</span>
                  </summary>
                  <p className="mt-2 text-[15px] text-fg-muted">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-20 md:py-28">
          <div className="mx-auto max-w-3xl px-5 text-center">
            <h2 className="text-balance text-4xl font-semibold tracking-tight md:text-5xl">Why did email ever work differently?</h2>
            <p className="mx-auto mt-4 max-w-lg text-lg text-fg-muted">Connect your Gmail in under a minute. Your recent conversations appear first — the rest follows in the background.</p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Button asChild size="xl">
                <a href="/api/auth/google/login">Connect Gmail — Get started</a>
              </Button>
              <Button asChild size="xl" variant="outline">
                <Link href="/demo">Try the demo</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 py-8 text-sm text-fg-muted md:flex-row">
          <Logo className="h-6" />
          <nav className="flex flex-wrap justify-center gap-6">
            <Link href="/demo" className="hover:text-fg">Demo</Link>
            <Link href="/privacy" className="hover:text-fg">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-fg">Terms of Service</Link>
            <a href="#security" className="hover:text-fg">Security</a>
          </nav>
          <p className="text-xs text-fg-subtle">© {new Date().getFullYear()} emailto.chat · Gmail is a trademark of Google LLC.</p>
        </div>
      </footer>
    </div>
  );
}

function SectionTitle({ eyebrow, title, text }: { eyebrow: string; title: string; text?: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="text-sm font-semibold text-accent">{eyebrow}</p>
      <h2 className="mt-2 text-balance text-3xl font-semibold tracking-tight md:text-[44px] md:leading-[1.1]">{title}</h2>
      {text && <p className="mt-4 text-pretty text-lg text-fg-muted">{text}</p>}
    </div>
  );
}

function FeatureRow({ eyebrow, title, text, visual, reverse }: { eyebrow: string; title: string; text: string; visual: React.ReactNode; reverse?: boolean }) {
  return (
    <div className="grid items-center gap-10 md:grid-cols-2 md:gap-16">
      <div className={reverse ? "md:order-2" : undefined}>
        <p className="text-sm font-semibold text-accent">{eyebrow}</p>
        <h3 className="mt-2 text-balance text-3xl font-semibold tracking-tight md:text-4xl">{title}</h3>
        <p className="mt-4 text-pretty text-lg text-fg-muted">{text}</p>
      </div>
      <div className={reverse ? "md:order-1" : undefined}>{visual}</div>
    </div>
  );
}

function Bubble({ children, mine }: { children: React.ReactNode; mine?: boolean }) {
  return (
    <div className={mine ? "flex justify-end" : "flex justify-start"}>
      <div className={mine ? "max-w-[80%] rounded-[20px] rounded-br-md bg-bubble-out px-3.5 py-2 text-[15px] text-bubble-out-fg" : "max-w-[80%] rounded-[20px] rounded-bl-md bg-bubble-in px-3.5 py-2 text-[15px]"}>{children}</div>
    </div>
  );
}

function GroupLine({ name, color, email, text }: { name: string; color: string; email: string; text: string }) {
  return (
    <div className="flex items-end gap-2">
      <Avatar email={email} name={name} size="sm" />
      <div>
        <p className={`mb-0.5 ml-3 text-xs font-medium ${color}`}>{name}</p>
        <div className="rounded-[20px] rounded-bl-md bg-bubble-in px-3.5 py-2 text-[15px]">{text}</div>
      </div>
    </div>
  );
}
