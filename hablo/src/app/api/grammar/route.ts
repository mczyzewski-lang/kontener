import { withSession } from "@/lib/api";
import { grammarMap } from "@/lib/services/grammar";

export const GET = withSession(async (_req, s) => ({ topics: await grammarMap(s) }));
