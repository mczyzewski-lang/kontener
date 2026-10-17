import { db } from "@/server/db";
import { runAfter } from "@/server/http";
import { log } from "@/server/log";
import { decodePushBody, verifyPubSubPush } from "@/server/sync/pubsub";
import { runSync } from "@/server/sync/engine";

export const maxDuration = 30;

/**
 * Gmail → Pub/Sub push endpoint. Exempt from CSRF/session (authenticated by OIDC JWT and/or token).
 * Answers 204 quickly (Pub/Sub retries non-2xx); the incremental sync runs after the response.
 */
export async function POST(req: Request) {
  const verdict = await verifyPubSubPush(req).catch(() => "not_configured" as const);
  if (verdict === "not_configured") return new Response(null, { status: 503 });
  if (verdict !== "ok") return new Response(null, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(null, { status: 204 }); // malformed → ack, retrying won't help
  }
  const note = decodePushBody(body);
  if (!note) return new Response(null, { status: 204 });

  const accounts = await db.mailAccount.findMany({
    where: { emailAddress: note.emailAddress, status: "active" },
    select: { id: true, syncState: { select: { historyId: true } } },
    take: 10,
  });
  const due = accounts.filter((a) => {
    const stored = a.syncState?.historyId;
    try {
      return !stored || BigInt(note.historyId) > BigInt(stored);
    } catch {
      return true;
    }
  });
  if (due.length) {
    await runAfter(async () => {
      for (const a of due) await runSync(a.id, { budgetMs: 6000, incrementalOnly: true });
    });
  }
  log.info("pubsub_push", { accounts: due.length });
  return new Response(null, { status: 204 });
}
