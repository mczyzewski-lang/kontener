import type { Metadata } from "next";
import { LogoMark } from "@/components/brand/logo";

export const metadata: Metadata = { title: "Offline", robots: { index: false } };

export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-bg px-6 text-center">
      <LogoMark className="size-12" />
      <h1 className="text-xl font-semibold tracking-tight">You’re offline</h1>
      <p className="max-w-sm text-sm text-fg-muted">emailto.chat needs a connection to reach Gmail. Your mail is safe — we’ll pick up where you left off when you’re back online.</p>
      <a href="/app" className="rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-accent-fg">
        Try again
      </a>
    </main>
  );
}
