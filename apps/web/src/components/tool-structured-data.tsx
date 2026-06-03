import { site } from "@/lib/site";

export type ToolFaq = { q: string; a: string };

/**
 * Schema.org JSON-LD for a free browser tool page. Emits a WebApplication node
 * (free, browser-based utility — helps search + AI engines describe the tool)
 * and a FAQPage built from the SAME `faqs` the page renders visibly, so the
 * markup always matches on-page content.
 *
 * Note: since Aug 2023 Google only shows FAQ rich results for government/health
 * sites, so this won't add FAQ rich snippets — it's kept because it accurately
 * mirrors visible Q&A and is used by AI/LLM answer engines (GEO).
 */
export function ToolStructuredData({
  name,
  description,
  path,
  faqs,
}: {
  name: string;
  description: string;
  /** Absolute path, e.g. "/tools/microphone-test". */
  path: string;
  faqs: ToolFaq[];
}) {
  const url = `${site.url}${path}`;

  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebApplication",
        "@id": `${url}#app`,
        name,
        description,
        url,
        applicationCategory: "UtilitiesApplication",
        operatingSystem: "Any (runs in a web browser)",
        browserRequirements: "Requires a modern browser with JavaScript enabled",
        isAccessibleForFree: true,
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        publisher: {
          "@type": "Organization",
          name: site.name,
          url: site.url,
        },
      },
      {
        "@type": "FAQPage",
        "@id": `${url}#faq`,
        mainEntity: faqs.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(graph) }}
    />
  );
}
