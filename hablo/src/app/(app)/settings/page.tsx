import { requirePageSession } from "@/lib/session";
import { getPrefs } from "@/lib/learning/profile";
import { integrationStatus } from "@/lib/env";
import { usageSummary } from "@/lib/usage";
import { voiceAvailable } from "@/lib/services/conversation";
import { SITUATIONS } from "@/lib/learning/situations";
import { PageHeader } from "@/components/ui/primitives";
import { SettingsForm } from "./settings-form";

export const metadata = { title: "Ustawienia" };

export default async function SettingsPage() {
  const s = await requirePageSession();
  const prefs = await getPrefs(s.db, s.userId);
  const status = { ...integrationStatus(), voice: voiceAvailable() };
  const usage = await usageSummary(s.db, s.userId);
  return (
    <div className="animate-fade-in">
      <PageHeader title="Ustawienia" />
      <SettingsForm
        email={s.email}
        mode={s.mode}
        prefs={prefs}
        status={status}
        usage={usage}
        situations={SITUATIONS.map((x) => ({ id: x.id, label: x.label }))}
      />
    </div>
  );
}
