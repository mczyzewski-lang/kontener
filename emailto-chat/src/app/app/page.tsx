import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAccountInfo } from "@/server/domain/account-info";
import { getCurrentUser } from "@/server/security/session";
import { LiveApp } from "./live-app";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Chats", robots: { index: false } };

export default async function AppPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/api/auth/google/login");
  const account = await getAccountInfo(user);
  if (!account.mailAccount) redirect("/app/connect");
  return <LiveApp initialAccount={account} />;
}
