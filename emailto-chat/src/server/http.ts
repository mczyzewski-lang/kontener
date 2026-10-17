/** Small helpers for route handlers. */
import type { MailAccount } from "@prisma/client";
import { getGmailForAccount } from "./gmail/factory";
import type { GmailApi } from "./gmail/types";

export function gmailFor(account: MailAccount): GmailApi {
  return getGmailForAccount(account);
}

/** Absolute redirect (Location must be absolute for some clients). */
export function redirectTo(appUrl: string, path: string, headers: [string, string][] = []): Response {
  const h = new Headers({ Location: new URL(path, appUrl).toString(), "Cache-Control": "no-store" });
  for (const [k, v] of headers) h.append(k, v);
  return new Response(null, { status: 303, headers: h });
}

/** Run background work after the response when possible (Next `after`), else fire-and-forget. */
export async function runAfter(fn: () => Promise<unknown>): Promise<void> {
  try {
    const { after } = await import("next/server");
    after(async () => {
      await fn().catch(() => undefined);
    });
  } catch {
    void fn().catch(() => undefined);
  }
}
