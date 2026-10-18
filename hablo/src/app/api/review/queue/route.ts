import { withSession } from "@/lib/api";
import { buildQueue } from "@/lib/services/review";
import { eq } from "@/lib/db/db";

export const GET = withSession(async (req, s) => {
  const url = new URL(req.url);
  const mode = (url.searchParams.get("mode") ?? "review") as "review" | "new" | "practice";
  const itemId = url.searchParams.get("item");
  let entryIds: string[] | undefined;
  let limit: number | undefined;
  if (itemId) {
    const item = (await s.db.select("daily_plan_items", { where: [eq("id", itemId), eq("user_id", s.userId)], limit: 1 }))[0];
    if (item) {
      entryIds = item.entry_ids;
      limit = (item.payload as { limit?: number })?.limit;
    }
  }
  return { items: await buildQueue(s, { mode: ["review", "new", "practice"].includes(mode) ? mode : "review", entryIds, limit }) };
});
