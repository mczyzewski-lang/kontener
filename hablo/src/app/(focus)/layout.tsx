import { requirePageSession } from "@/lib/session";
import { CapabilitiesProvider } from "@/components/capabilities";
import { DemoBanner } from "@/components/demo-banner";
import { serverCapabilities } from "@/lib/capabilities";

/** Full-screen, distraction-free layout for exercises, onboarding and conversations. */
export default async function FocusLayout({ children }: { children: React.ReactNode }) {
  await requirePageSession({ allowNotOnboarded: true });
  const caps = serverCapabilities();
  return (
    <CapabilitiesProvider value={caps}>
      <DemoBanner caps={caps} />
      <main className="safe-top safe-bottom mx-auto flex min-h-dvh w-full max-w-xl flex-col px-4 pt-3 md:pt-8">{children}</main>
    </CapabilitiesProvider>
  );
}
