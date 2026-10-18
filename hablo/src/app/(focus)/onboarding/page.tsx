import { redirect } from "next/navigation";
import { requirePageSession } from "@/lib/session";
import { getProfile } from "@/lib/learning/profile";
import { SITUATIONS } from "@/lib/learning/situations";
import { Onboarding } from "./onboarding";

export const metadata = { title: "Witaj" };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ redo?: string }> }) {
  const s = await requirePageSession({ allowNotOnboarded: true });
  const profile = await getProfile(s.db, s.userId);
  const { redo } = await searchParams;
  if (profile?.onboarded_at && !redo) redirect("/");
  return <Onboarding situations={SITUATIONS.map((x) => ({ id: x.id, label: x.label }))} />;
}
