"use client";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public data: unknown = null,
  ) {
    super(message);
  }
}

/** JSON fetch with consistent error handling and a clear offline message. */
export async function api<T>(url: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(url, {
      ...rest,
      headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...(rest.headers ?? {}) },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  } catch {
    throw new ApiError(0, "Brak połączenia z internetem. Twoje dotychczasowe odpowiedzi są zapisane — spróbuj ponownie.");
  }
  // 401 means the session expired — except from sign-in itself, where it means wrong credentials.
  if (res.status === 401 && !url.startsWith("/api/auth/")) {
    if (typeof window !== "undefined") window.location.replace(`${window.location.origin}/login`);
    throw new ApiError(401, "Sesja wygasła.");
  }
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `Błąd ${res.status}`, data);
  return data as T;
}
