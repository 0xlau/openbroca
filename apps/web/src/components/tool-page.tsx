import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { site, toolPages } from "@/lib/site";
import { PageShell } from "@/components/page-shell";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { ConversionCTA } from "@/components/conversion-cta";
import { ToolStructuredData, type ToolFaq } from "@/components/tool-structured-data";

export type ToolSection = { heading: string; body: ReactNode };

/**
 * Shared layout for an individual tool page. Renders the interactive widget,
 * supporting content, a visible FAQ (mirrored into FAQPage JSON-LD), and links
 * to the other tools + the homepage CTA — so link equity flows between the
 * tool spokes and back to the product's money pages.
 */
export function ToolPage({
  slug,
  eyebrow,
  title,
  schemaName,
  schemaDescription,
  lead,
  tool,
  sections,
  faqs,
  ctaHeading,
  ctaSubheading,
}: {
  /** Path segment under /tools, e.g. "microphone-test". */
  slug: string;
  eyebrow: string;
  title: string;
  schemaName: string;
  schemaDescription: string;
  lead: ReactNode;
  /** The interactive client widget. */
  tool: ReactNode;
  sections: ToolSection[];
  faqs: ToolFaq[];
  ctaHeading?: string;
  ctaSubheading?: string;
}) {
  const path = `/tools/${slug}`;
  const related = toolPages.filter((t) => t.href !== path);

  return (
    <PageShell>
      <ToolStructuredData
        name={schemaName}
        description={schemaDescription}
        path={path}
        faqs={faqs}
      />

      <article className="container-px pt-12 pb-4 md:pt-16">
        <Breadcrumbs
          items={[
            { label: "Home", href: "/" },
            { label: "Tools", href: "/tools" },
            { label: eyebrow, href: path },
          ]}
        />

        <header className="mt-8 max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-widest text-brand">
            {eyebrow}
          </p>
          <h1 className="mt-3 font-display text-4xl tracking-tight text-white md:text-5xl">
            {title}
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-white/70">{lead}</p>
        </header>

        {/* The interactive tool */}
        <div className="mt-10">{tool}</div>

        {/* Supporting content */}
        <div className="mt-16 max-w-3xl space-y-14">
          {sections.map((section) => (
            <section key={section.heading}>
              <h2 className="font-display text-2xl tracking-tight text-white md:text-3xl">
                {section.heading}
              </h2>
              <div className="mt-4 space-y-4 text-base leading-relaxed text-white/65">
                {section.body}
              </div>
            </section>
          ))}

          {/* FAQ — visible content, mirrored into FAQPage JSON-LD above */}
          {faqs.length > 0 && (
            <section>
              <h2 className="font-display text-2xl tracking-tight text-white md:text-3xl">
                Frequently asked questions
              </h2>
              <dl className="mt-8 divide-y divide-line overflow-hidden rounded-2xl border border-line">
                {faqs.map((faq) => (
                  <div key={faq.q} className="bg-bg-elevated/40 p-6">
                    <dt className="text-base font-semibold text-white">
                      {faq.q}
                    </dt>
                    <dd className="mt-2 text-sm leading-relaxed text-white/60">
                      {faq.a}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {/* Related tools — cross-links between spokes */}
          <section>
            <h2 className="font-display text-2xl tracking-tight text-white md:text-3xl">
              More free tools
            </h2>
            <ul className="mt-6 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2">
              {related.map((t) => (
                <li key={t.href}>
                  <a
                    href={t.href}
                    className="group flex items-center justify-between gap-3 bg-bg p-5 transition hover:bg-bg-elevated"
                  >
                    <span className="text-sm font-medium text-white/80 group-hover:text-white">
                      {t.label}
                    </span>
                    <ArrowRight className="size-4 shrink-0 text-white/30 transition group-hover:text-brand" />
                  </a>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm text-white/45">
              See all{" "}
              <a
                href="/tools"
                className="text-white/70 underline-offset-4 hover:text-white hover:underline"
              >
                free voice &amp; audio tools
              </a>
              , or learn about{" "}
              <a
                href={site.url}
                className="text-white/70 underline-offset-4 hover:text-white hover:underline"
              >
                {site.name}
              </a>
              .
            </p>
          </section>
        </div>
      </article>

      <ConversionCTA heading={ctaHeading} subheading={ctaSubheading} />
    </PageShell>
  );
}
