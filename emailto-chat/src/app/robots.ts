import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.APP_URL || "https://emailto.chat";
  return {
    rules: [{ userAgent: "*", allow: ["/", "/demo", "/privacy", "/terms"], disallow: ["/app", "/api"] }],
    sitemap: `${base}/sitemap.xml`,
  };
}
