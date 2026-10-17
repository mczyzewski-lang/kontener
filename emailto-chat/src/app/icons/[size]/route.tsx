import { ImageResponse } from "next/og";
import { AppIcon } from "@/components/brand/app-icon";

export const dynamic = "force-static";

export function generateStaticParams() {
  return [{ size: "192" }, { size: "512" }, { size: "maskable-512" }];
}

/** App icons for the PWA manifest, rendered at build time. */
export async function GET(_req: Request, ctx: { params: Promise<{ size: string }> }) {
  const { size: raw } = await ctx.params;
  const maskable = raw.startsWith("maskable-");
  const size = Number(raw.replace("maskable-", "")) || 512;
  return new ImageResponse(<AppIcon size={size} maskable={maskable} />, { width: size, height: size });
}
