import { site } from "@/lib/site";

export type Crumb = { label: string; href: string };

/**
 * Renders a visual breadcrumb trail and the matching BreadcrumbList JSON-LD.
 * `href` values should be absolute paths (e.g. "/vs/wispr-flow"); they are
 * resolved against the site URL for the structured data.
 */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.label,
      item: `${site.url}${item.href === "/" ? "" : item.href}`,
    })),
  };

  return (
    <nav aria-label="Breadcrumb" className="text-sm text-white/45">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ol className="flex flex-wrap items-center gap-1.5">
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <li key={item.href} className="flex items-center gap-1.5">
              {last ? (
                <span className="text-white/70">{item.label}</span>
              ) : (
                <>
                  <a
                    href={item.href}
                    className="transition hover:text-white/80"
                  >
                    {item.label}
                  </a>
                  <span aria-hidden className="text-white/25">
                    /
                  </span>
                </>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
