import { withSession } from "@/lib/api";
import { placementTest } from "@/lib/services/onboarding";

export const GET = withSession(async (_req, s) => placementTest(s));
