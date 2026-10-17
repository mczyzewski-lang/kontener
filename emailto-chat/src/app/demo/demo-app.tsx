"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { ChatApp } from "@/components/mail/chat-app";
import { DemoMailClient } from "@/demo/demo-client";

export function DemoApp({ embedded = false }: { embedded?: boolean }) {
  const router = useRouter();
  const [client] = React.useState(() => new DemoMailClient({ latency: embedded ? 60 : 140 }));
  return <ChatApp client={client} embedded={embedded} onExit={() => router.push("/")} className={embedded ? "h-full" : undefined} />;
}
