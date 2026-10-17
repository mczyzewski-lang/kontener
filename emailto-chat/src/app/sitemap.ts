import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.APP_URL || "https://emailto.chat";
  return ["", "/demo", "/privacy", "/terms"].map((p) => ({ url: `${base}${p}`, changeFrequency: "monthly", priority: p ? 0.5 : 1 }));
}
