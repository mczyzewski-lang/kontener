import "server-only";
import fs from "node:fs";
import path from "node:path";
import { appMode, env } from "@/lib/env";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Binary storage for cached TTS audio and (opt-in) conversation recordings:
 * Supabase Storage in production, a local folder in demo mode.
 */
type Bucket = "tts-cache" | "recordings";

function localPath(bucket: Bucket, key: string) {
  return path.join(path.dirname(env.dataFile()), bucket, key.replace(/\.\./g, ""));
}

export async function getObject(bucket: Bucket, key: string): Promise<ArrayBuffer | null> {
  if (appMode() === "demo") {
    const p = localPath(bucket, key);
    if (!fs.existsSync(p)) return null;
    const buf = fs.readFileSync(p);
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  }
  const client = createServiceClient();
  if (!client) return null;
  const { data, error } = await client.storage.from(bucket).download(key);
  if (error || !data) return null;
  return data.arrayBuffer();
}

export async function putObject(bucket: Bucket, key: string, bytes: ArrayBuffer, contentType = "audio/mpeg"): Promise<boolean> {
  if (appMode() === "demo") {
    const p = localPath(bucket, key);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, Buffer.from(bytes));
    return true;
  }
  const client = createServiceClient();
  if (!client) return false;
  const { error } = await client.storage.from(bucket).upload(key, bytes, { contentType, upsert: true });
  return !error;
}

export async function deleteObjects(bucket: Bucket, keys: string[]): Promise<void> {
  if (!keys.length) return;
  if (appMode() === "demo") {
    for (const k of keys) fs.rmSync(localPath(bucket, k), { force: true });
    return;
  }
  const client = createServiceClient();
  if (client) await client.storage.from(bucket).remove(keys);
}
