"use client";

import { AlertTriangle, CheckCircle2, Loader2, LogOut, RefreshCw, Trash2, Unplug } from "lucide-react";
import * as React from "react";
import type { UserPreferences } from "@/core/types";
import { Button } from "@/components/ui/button";
import { cn, formatFullDate } from "@/lib/utils";
import { useMail } from "./mail-context";

export interface AccountActions {
  signOut: () => Promise<void>;
  disconnectGmail: () => Promise<void>;
  deleteAccount: () => Promise<void>;
}

export function SettingsView({ accountActions, className }: { accountActions?: AccountActions; className?: string }) {
  const { account, prefs, updatePrefs, client, syncStatus, syncNow } = useMail();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState("");
  const [syncing, setSyncing] = React.useState(false);
  const isDemo = client.mode === "demo";

  const run = async (name: string, fn: () => Promise<void>) => {
    setBusy(name);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={cn("space-y-6", className)}>
      <Group title="Account">
        {isDemo ? (
          <div className="rounded-xl border border-warning/30 bg-warning-soft p-4 text-sm">
            <p className="font-medium text-fg">You’re using Demo Mode</p>
            <p className="mt-1 text-fg-muted">All people, messages and files are sample data stored only in this browser tab. Nothing is sent.</p>
            <Button asChild size="sm" className="mt-3">
              <a href="/api/auth/google/login">Connect Gmail</a>
            </Button>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-panel p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{account?.user.name ?? account?.user.email}</p>
                <p className="truncate text-[13px] text-fg-muted">Signed in as {account?.user.email}</p>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2 text-[13px]">
              {account?.mailAccount?.status === "active" ? (
                <>
                  <CheckCircle2 className="size-4 text-success" /> Gmail connected: <span className="font-medium">{account.mailAccount.email}</span>
                </>
              ) : account?.mailAccount ? (
                <>
                  <AlertTriangle className="size-4 text-warning" /> Gmail access expired or was revoked.
                  <a href="/api/auth/google/connect" className="font-medium text-accent hover:underline">
                    Reconnect
                  </a>
                </>
              ) : (
                <>
                  <AlertTriangle className="size-4 text-warning" /> Gmail not connected.
                  <a href="/app/connect" className="font-medium text-accent hover:underline">
                    Connect
                  </a>
                </>
              )}
            </div>
            {account?.mailAccount && account.mailAccount.aliases.length > 1 && (
              <p className="mt-1.5 text-xs text-fg-muted">Your addresses: {account.mailAccount.aliases.join(", ")}</p>
            )}
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-fg-muted">
              <dt>Last sync</dt>
              <dd>{syncStatus?.lastSyncAt ? formatFullDate(syncStatus.lastSyncAt) : "—"}</dd>
              <dt>Indexed topics</dt>
              <dd>
                {syncStatus?.threadCount ?? "—"}
                {syncStatus && !syncStatus.backfillComplete && " (importing older mail…)"}
              </dd>
              <dt>Updates</dt>
              <dd>{account?.mailAccount?.pushEnabled ? "Gmail push notifications + periodic sync" : `Periodic sync every ${prefs.pollIntervalSec}s while open`}</dd>
              {syncStatus?.error && (
                <>
                  <dt>Last error</dt>
                  <dd className="text-danger">{syncStatus.error}</dd>
                </>
              )}
            </dl>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              disabled={syncing}
              onClick={async () => {
                setSyncing(true);
                await syncNow();
                setSyncing(false);
              }}
            >
              {syncing ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} Sync now
            </Button>
            <p className="mt-2 text-[11px] text-fg-subtle">E-mail is not real-time: delivery and sync can take a little while, like in any e-mail client.</p>
          </div>
        )}
      </Group>

      <Group title="Messaging">
        <Toggle
          label="Press Enter to send"
          description={prefs.enterToSend ? "Shift + Enter adds a new line." : "Ctrl/⌘ + Enter sends. Enter adds a new line."}
          checked={prefs.enterToSend}
          onChange={(v) => void updatePrefs({ enterToSend: v })}
        />
        <Toggle
          label="Always load remote images"
          description="Off by default: remote images can be used to track when you open an e-mail."
          checked={prefs.alwaysLoadRemoteImages}
          onChange={(v) => void updatePrefs({ alwaysLoadRemoteImages: v })}
        />
        {!isDemo && (
          <label className="flex items-center justify-between gap-4 py-2">
            <span>
              <span className="block text-sm font-medium">Check for new mail every</span>
              <span className="block text-xs text-fg-muted">While the app is open (in addition to push, if configured).</span>
            </span>
            <select
              value={prefs.pollIntervalSec}
              onChange={(e) => void updatePrefs({ pollIntervalSec: Number(e.target.value) })}
              className="h-8 rounded-lg border border-border bg-panel px-2 text-sm"
            >
              {[20, 45, 90, 180, 300].map((s) => (
                <option key={s} value={s}>
                  {s < 60 ? `${s} s` : `${s / 60} min`}
                </option>
              ))}
            </select>
          </label>
        )}
      </Group>

      <Group title="Appearance">
        <div role="radiogroup" className="grid grid-cols-3 gap-2">
          {(["system", "light", "dark"] as UserPreferences["theme"][]).map((t) => (
            <button
              key={t}
              role="radio"
              aria-checked={prefs.theme === t}
              onClick={() => void updatePrefs({ theme: t })}
              className={cn("rounded-xl border px-3 py-2.5 text-sm font-medium capitalize transition-colors", prefs.theme === t ? "border-accent bg-accent-soft text-accent" : "border-border hover:bg-hover")}
            >
              {t}
            </button>
          ))}
        </div>
      </Group>

      {!isDemo && accountActions && (
        <Group title="Privacy & data">
          <p className="text-xs text-fg-muted">
            emailto.chat keeps only a minimal index (people, subjects, short snippets, labels, attachment names) to show your conversations. Message bodies and attachments are fetched from Gmail when you open them and are not stored. <a href="/privacy" className="text-accent hover:underline">Privacy Policy</a>
          </p>
          <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:flex-wrap">
            <Button variant="outline" size="sm" onClick={() => void run("signout", accountActions.signOut)} disabled={!!busy}>
              {busy === "signout" ? <Loader2 className="size-3.5 animate-spin" /> : <LogOut className="size-3.5" />} Sign out
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!!busy || !account?.mailAccount}
              onClick={() => {
                if (window.confirm("Disconnect Gmail? We will revoke our access at Google and delete the local index of your mail. Your Gmail itself is not changed.")) void run("disconnect", accountActions.disconnectGmail);
              }}
            >
              {busy === "disconnect" ? <Loader2 className="size-3.5 animate-spin" /> : <Unplug className="size-3.5" />} Disconnect Gmail
            </Button>
          </div>
          <div className="mt-4 rounded-xl border border-danger/30 p-4">
            <p className="text-sm font-medium text-danger">Delete account and all stored data</p>
            <p className="mt-1 text-xs text-fg-muted">Revokes Gmail access and permanently deletes your emailto.chat account, index, preferences and sessions. Your Gmail mailbox is not affected. Type DELETE to confirm.</p>
            <div className="mt-3 flex gap-2">
              <input value={confirmDelete} onChange={(e) => setConfirmDelete(e.target.value)} placeholder="DELETE" className="h-8 w-28 rounded-lg border border-border bg-panel px-2 text-sm" aria-label="Type DELETE to confirm" />
              <Button variant="danger" size="sm" disabled={confirmDelete !== "DELETE" || !!busy} onClick={() => void run("delete", accountActions.deleteAccount)}>
                {busy === "delete" ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />} Delete everything
              </Button>
            </div>
          </div>
        </Group>
      )}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">{title}</h3>
      {children}
    </section>
  );
}

function Toggle({ label, description, checked, onChange }: { label: string; description?: string; checked: boolean; onChange: (v: boolean) => void }) {
  const id = React.useId();
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <label htmlFor={id} className="cursor-pointer">
        <span className="block text-sm font-medium">{label}</span>
        {description && <span className="block text-xs text-fg-muted">{description}</span>}
      </label>
      <button
        id={id}
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn("relative h-6 w-10 shrink-0 rounded-full transition-colors", checked ? "bg-accent" : "bg-border-strong")}
      >
        <span className={cn("absolute top-0.5 size-5 rounded-full bg-white shadow-sm transition-transform", checked ? "translate-x-[18px]" : "translate-x-0.5")} />
      </button>
    </div>
  );
}
