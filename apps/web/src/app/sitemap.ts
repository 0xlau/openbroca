import type { MetadataRoute } from "next";
import { comparePages, guidePages, site, toolPages } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return [
    {
      url: site.url,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1,
    },
    // Tools hub — the pillar for the free utility tools.
    {
      url: `${site.url}/tools`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    // Keyword landing pages + competitor comparisons + individual tools.
    ...[...guidePages, ...comparePages, ...toolPages].map((page) => ({
      url: `${site.url}${page.href}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  ];
}
