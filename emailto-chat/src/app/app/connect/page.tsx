import { CheckCircle2, Lock, ShieldCheck, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { getAccountInfo } from "@/server/domain/account-info";
import { getCurrentUser } from "@/server/security/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Connect Gmail", robots: { index: false } };

const ERRORS: Record<string, string> = {
  scope_denied: "Gmail access wasn’t granted. On Google’s consent screen, make sure the Gmail checkbox is ticked — emailto.chat can’t show your conversations without it.",
  account_mismatch: "You chose a different Google account than the one you signed in with. Please connect the Gmail of the account you’re signed in as, or sign out first.",
  access_denied: "You cancelled the Google consent screen. You can try again whenever you’re ready.",
  invalid_state: "The sign-in link expired. Please try again.",
  oauth_failed: "Google couldn’t complete the connection. Please try again.",
};

export default async function ConnectPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/api/auth/google/login");
  const info = await getAccountInfo(user);
  if (info.mailAccount?.status === "active" && !params.error) redirect("/app");
  const error = params.error ? (ERRORS[params.error] ?? ERRORS.oauth_failed) : null;
  const reconnect = info.mailAccount?.status === "needs_reauth";

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-subtle px-4 py-12">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-8 flex justify-center">
          <Logo className="h-7" />
        </Link>
        <div className="rounded-2xl border border-border bg-panel p-6 shadow-md sm:p-8">
          <p className="text-sm text-fg-muted">Signed in as {user.email}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{reconnect ? "Reconnect your Gmail" : "Connect your Gmail"}</h1>
          <p className="mt-2 text-[15px] text-fg-muted">
            {reconnect
              ? "Google no longer accepts our access to your mailbox (it may have expired or been revoked). Reconnect to continue."
              : "One more step. Google will ask you to allow emailto.chat to read, send and organize your e-mail — that’s what lets us turn your inbox into conversations."}
          </p>
          {params.disconnected && (
            <p className="mt-4 flex items-start gap-2 rounded-xl bg-subtle p-3 text-sm text-fg-muted">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" /> Gmail disconnected. Our access was revoked and your mail index was deleted.
            </p>
          )}
          {error && (
            <p className="mt-4 flex items-start gap-2 rounded-xl bg-danger-soft p-3 text-sm text-fg" role="alert">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-danger" /> {error}
            </p>
          )}
          <ul className="mt-6 space-y-3 text-sm">
            <li className="flex gap-3">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent" />
              <span>
                <strong className="font-medium">One permission: Gmail “modify”.</strong> <span className="text-fg-muted">Read, send, label and draft — never permanent deletion. We don’t ask for full mailbox control.</span>
              </span>
            </li>
            <li className="flex gap-3">
              <Lock className="mt-0.5 size-4 shrink-0 text-accent" />
              <span>
                <strong className="font-medium">Minimal storage.</strong> <span className="text-fg-muted">Bodies and attachments are fetched from Gmail when you open them. We keep only an index to group conversations by person.</span>
              </span>
            </li>
            <li className="flex gap-3">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-accent" />
              <span>
                <strong className="font-medium">Still your Gmail.</strong> <span className="text-fg-muted">Everything you send lands in Gmail’s Sent folder. Disconnect any time in Settings.</span>
              </span>
            </li>
          </ul>
          <Button asChild size="xl" className="mt-8 w-full">
            <a href="/api/auth/google/connect">{reconnect ? "Reconnect Gmail" : "Connect Gmail"}</a>
          </Button>
          <p className="mt-4 text-center text-xs text-fg-subtle">
            By continuing you agree to our <Link href="/terms" className="underline">Terms</Link> and <Link href="/privacy" className="underline">Privacy Policy</Link>.
          </p>
        </div>
        <p className="mt-6 text-center text-sm text-fg-muted">
          Not ready? <Link href="/demo" className="font-medium text-accent hover:underline">Try the demo</Link> · <LogoutLink />
        </p>
      </div>
    </main>
  );
}

function LogoutLink() {
  return (
    <form action="/api/auth/logout" method="post" className="inline">
      <button className="font-medium text-accent hover:underline">Sign out</button>
    </form>
  );
}
