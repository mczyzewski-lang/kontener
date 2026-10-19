import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { verifyWebhookSignature } from "@/lib/elevenlabs/server";
import { getServiceDb } from "@/lib/session";
import { handlePostCallWebhook, type PostCallWebhook } from "@/lib/services/conversation";

/**
 * ElevenLabs post-call webhook. Authenticated by HMAC signature (no user
 * session); writes with the service role, scoped to the session it references.
 */
export async function POST(req: Request) {
  const secret = env.elevenWebhookSecret();
  if (!secret) return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  const raw = await req.text();
  if (!verifyWebhookSignature(raw, req.headers.get("elevenlabs-signature"), secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }
  const db = await getServiceDb();
  if (!db) return NextResponse.json({ error: "Service role not configured" }, { status: 503 });
  try {
    const result = await handlePostCallWebhook(db, JSON.parse(raw) as PostCallWebhook);
    return NextResponse.json(result);
  } catch (e) {
    console.error("webhook failed", e);
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
}
