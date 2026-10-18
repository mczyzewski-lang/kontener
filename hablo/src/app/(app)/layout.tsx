import { requirePageSession } from "@/lib/session";
import { CapabilitiesProvider } from "@/components/capabilities";
import { BottomNav, SideNav } from "@/components/app-nav";
import { DemoBanner } from "@/components/demo-banner";
import { serverCapabilities } from "@/lib/capabilities";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requirePageSession();
  const caps = serverCapabilities();
  return (
    <CapabilitiesProvider value={caps}>
      <DemoBanner caps={caps} />
      <div className="flex">
        <SideNav />
        <main className="safe-top mx-auto w-full max-w-2xl px-4 pt-4 pb-28 md:px-8 md:pt-10 md:pb-12">{children}</main>
      </div>
      <BottomNav />
    </CapabilitiesProvider>
  );
}
