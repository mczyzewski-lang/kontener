"use client";

import dynamic from "next/dynamic";

// Client-only: sample data uses "now"-relative timestamps, so we skip SSR to avoid hydration drift.
const DemoApp = dynamic(() => import("@/app/demo/demo-app").then((m) => m.DemoApp), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-fg-subtle">
      <span className="animate-pulse">Loading the live demo…</span>
    </div>
  ),
});

export function EmbeddedDemo() {
  return <DemoApp embedded />;
}
