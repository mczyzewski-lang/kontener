import { withSession } from "@/lib/api";
import { exportCsv, exportJson } from "@/lib/services/data";

export const GET = withSession(async (req, s) => {
  const format = new URL(req.url).searchParams.get("format") === "csv" ? "csv" : "json";
  const date = new Date().toISOString().slice(0, 10);
  if (format === "csv") {
    return new Response(await exportCsv(s), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="hablo-postepy-${date}.csv"` },
    });
  }
  return new Response(JSON.stringify(await exportJson(s), null, 2), {
    headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="hablo-eksport-${date}.json"` },
  });
});
