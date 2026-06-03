import { site } from "@/lib/site";

/**
 * Schema.org JSON-LD for the homepage. Combines SoftwareApplication (the app
 * itself — surfaces price/OS/category in rich results and helps AI engines
 * describe OpenBroca), WebSite, and Organization into a single @graph.
 */
export function StructuredData() {
  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        "@id": `${site.url}/#software`,
        name: site.name,
        description: site.seoDescription,
        applicationCategory: "UtilitiesApplication",
        applicationSubCategory: "Voice dictation / Speech-to-text",
        operatingSystem: "macOS, Windows, Linux",
        softwareVersion: site.version,
        url: site.url,
        downloadUrl: site.releases,
        license: site.license,
        isAccessibleForFree: true,
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD",
        },
        author: {
          "@type": "Person",
          name: site.author.name,
          url: site.author.url,
        },
      },
      {
        "@type": "WebSite",
        "@id": `${site.url}/#website`,
        url: site.url,
        name: site.name,
        description: site.seoDescription,
        inLanguage: "en",
      },
      {
        "@type": "Organization",
        "@id": `${site.url}/#org`,
        name: site.name,
        url: site.url,
        logo: `${site.url}/app-icon.png`,
        sameAs: [site.repo],
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      // JSON.stringify output is safe to inject here.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(graph) }}
    />
  );
}
