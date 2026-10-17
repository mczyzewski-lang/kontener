import type { Metadata } from "next";
import { DemoApp } from "./demo-app";

export const metadata: Metadata = {
  title: "Live demo",
  description: "Try emailto.chat with sample conversations — no account needed. People first, topics as tabs, e-mail as chat bubbles.",
};

export default function DemoPage() {
  return <DemoApp />;
}
