import Link from "next/link";
import { Logo } from "@/components/brand/logo";

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-bg">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-5">
          <Link href="/" aria-label="emailto.chat home">
            <Logo className="h-7" />
          </Link>
          <Link href="/demo" className="text-sm text-fg-muted hover:text-fg">
            Try demo
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-12">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{title}</h1>
        <p className="mt-2 text-sm text-fg-muted">Last updated: {updated}</p>
        <div className="mt-10 space-y-5 text-[15px] leading-relaxed text-fg-muted [&_a]:text-accent [&_a:hover]:underline [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-fg [&_h3]:mt-6 [&_h3]:font-semibold [&_h3]:text-fg [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-fg">
          {children}
        </div>
      </main>
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-3xl flex-wrap gap-6 px-5 py-8 text-sm text-fg-muted">
          <Link href="/">Home</Link>
          <Link href="/privacy">Privacy Policy</Link>
          <Link href="/terms">Terms of Service</Link>
        </div>
      </footer>
    </div>
  );
}

/** Operator details — replace before public launch (see README → "Before launch"). */
export const OPERATOR = {
  name: "[Operator legal name]",
  address: "[Registered address]",
  email: "privacy@emailto.chat",
};
