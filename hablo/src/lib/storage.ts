import "server-only";
import fs from "node:fs";
import path from "node:path";
import { appMode, env } from "@/lib/env";
import { createServiceClient } from "@/lib/supabase/server";
import { getPool } from "@/lib/db/postgres";

/**
 * Binary storage for cached TTS audio and (opt-in) conversation recordings:
 * Supabase Storage, the blobs table in plain-Postgres mode, a local folder in demo mode.
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
  if (appMode() === "postgres") {
    const pool = await getPool(env.databaseUrl()!);
    const { rows } = await pool.query("select bytes from public.blobs where bucket = $1 and key = $2", [bucket, key]);
    if (!rows[0]) return null;
    const buf = rows[0].bytes as Buffer;
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
  if (appMode() === "postgres") {
    const pool = await getPool(env.databaseUrl()!);
    await pool.query(
      `insert into public.blobs (bucket, key, content_type, bytes) values ($1, $2, $3, $4)
       on conflict (bucket, key) do update set content_type = excluded.content_type, bytes = excluded.bytes, created_at = now()`,
      [bucket, key, contentType, Buffer.from(bytes)],
    );
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
  if (appMode() === "postgres") {
    const pool = await getPool(env.databaseUrl()!);
    await pool.query("delete from public.blobs where bucket = $1 and key = any($2)", [bucket, keys]);
    return;
  }
  const client = createServiceClient();
  if (client) await client.storage.from(bucket).remove(keys);
}
