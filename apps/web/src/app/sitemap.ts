import type { MetadataRoute } from "next";
import { comparePages, guidePages, site } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return [
    {
      url: site.url,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1,
    },
    // Keyword landing pages + competitor comparisons.
    ...[...guidePages, ...comparePages].map((page) => ({
      url: `${site.url}${page.href}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  ];
}
