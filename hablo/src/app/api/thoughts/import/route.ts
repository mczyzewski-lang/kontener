import { withSession } from "@/lib/api";
import { importLibrary } from "@/lib/thoughts/service";
import { HttpError } from "@/lib/http-error";

/** Imports the private library from an uploaded JSON file. Re-importing never overwrites edited entries. */
export const POST = withSession(async (req, s) => {
  const text = await req.text();
  if (text.length > 5_000_000) throw new HttpError(413, "Plik jest za duży.");
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new HttpError(400, "To nie jest poprawny plik JSON.");
  }
  try {
    return await importLibrary(s.db, s.userId, raw);
  } catch (e) {
    throw new HttpError(400, e instanceof Error ? e.message : "Nie udało się zaimportować.");
  }
});
