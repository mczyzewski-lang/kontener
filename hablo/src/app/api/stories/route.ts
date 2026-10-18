import { withSession } from "@/lib/api";
import { createNewStory, listStories } from "@/lib/services/stories";

export const GET = withSession(async (_req, s) => ({ stories: await listStories(s) }));
export const POST = withSession(async (_req, s) => createNewStory(s));
