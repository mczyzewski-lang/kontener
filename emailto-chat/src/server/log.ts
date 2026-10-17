/**
 * Structured logger. Only ids, codes, counts and durations are ever logged —
 * NEVER tokens, message bodies, subjects, snippets or e-mail addresses.
 */
type Scalar = string | number | boolean | null | undefined;

function emit(level: "info" | "warn" | "error", event: string, fields: Record<string, Scalar> = {}) {
  if (process.env.NODE_ENV === "test" && process.env.ETC_LOG !== "1") return;
  const line = JSON.stringify({ level, event, ts: new Date().toISOString(), ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  info: (event: string, fields?: Record<string, Scalar>) => emit("info", event, fields),
  warn: (event: string, fields?: Record<string, Scalar>) => emit("warn", event, fields),
  error: (event: string, fields?: Record<string, Scalar>) => emit("error", event, fields),
};

/** A safe, PII-free description of an error: its name/code only. */
export function errorCode(err: unknown): string {
  if (!err || typeof err !== "object") return "unknown";
  const e = err as { code?: unknown; kind?: unknown; name?: unknown; status?: unknown };
  return String(e.kind ?? e.code ?? e.status ?? e.name ?? "unknown").slice(0, 64);
}
