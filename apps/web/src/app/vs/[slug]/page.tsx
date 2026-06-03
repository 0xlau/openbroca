import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Check, Info } from "lucide-react";
import { ogImage, site } from "@/lib/site";
import {
  COMPARE_DISCLAIMER,
  comparisons,
  getComparison,
} from "@/lib/comparisons";
import { PageShell } from "@/components/page-shell";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { ComparisonTable } from "@/components/comparison-table";
import { ConversionCTA } from "@/components/conversion-cta";

type Params = { slug: string };

export function generateStaticParams(): Params[] {
  return comparisons.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const c = getComparison(slug);
  if (!c) return {};
  const url = `${site.url}/vs/${c.slug}`;
  return {
    title: { absolute: c.metaTitle },
    description: c.metaDescription,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      url,
      title: c.metaTitle,
      description: c.metaDescription,
      siteName: site.name,
      images: [ogImage],
    },
    twitter: {
      card: "summary_large_image",
      title: c.metaTitle,
      description: c.metaDescription,
      images: [ogImage.url],
    },
  };
}

export default async function ComparisonPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const c = getComparison(slug);
  if (!c) notFound();

  return (
    <PageShell>
      <article className="container-px pt-12 pb-4 md:pt-16">
        <Breadcrumbs
          items={[
            { label: "Home", href: "/" },
            { label: `OpenBroca vs ${c.name}`, href: `/vs/${c.slug}` },
          ]}
        />

        <header className="mt-8 max-w-3xl">
          <h1 className="font-display text-4xl tracking-tight text-white md:text-5xl">
            {c.h1}
          </h1>
          <p className="mt-4 text-base leading-relaxed text-white/50">
            {c.positioning}
          </p>
          <div className="mt-6 space-y-4">
            {c.intro.map((p) => (
              <p key={p} className="text-lg leading-relaxed text-white/70">
                {p}
              </p>
            ))}
          </div>
        </header>
      </article>

      {/* Reasons */}
      <section className="container-px py-12 md:py-16">
        <h2 className="font-display text-3xl tracking-tight text-white md:text-4xl">
          Why choose OpenBroca over {c.name}
        </h2>
        <div className="mt-8 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2">
          {c.reasons.map((r) => (
            <div key={r.title} className="bg-bg p-7">
              <div className="inline-flex size-10 items-center justify-center rounded-xl border border-line-strong bg-brand/10 text-brand">
                <Check className="size-5" strokeWidth={2.5} />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-white">
                {r.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-white/55">
                {r.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Comparison table */}
      <section className="container-px py-12 md:py-16">
        <h2 className="font-display text-3xl tracking-tight text-white md:text-4xl">
          OpenBroca vs {c.name} at a glance
        </h2>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-white/55">
          A side-by-side look at how the two compare on the things that tend to
          matter most for a daily-driver dictation tool.
        </p>
        <div className="mt-8">
          <ComparisonTable competitorName={c.name} rows={c.rows} />
        </div>
        <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-white/40">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {COMPARE_DISCLAIMER}
        </p>
      </section>

      {/* Honest take */}
      <section className="container-px py-12 md:py-16">
        <div className="mx-auto max-w-3xl rounded-3xl border border-line bg-bg-elevated/40 p-8 md:p-10">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-brand">
            The honest take
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-white/75">
            {c.honestTake}
          </p>
        </div>
      </section>

      <ConversionCTA
        heading={`Switch to OpenBroca`}
        subheading={`Free, open source, and local-capable. Bring your own models, keep your data yours, and dictate into any app on macOS, Windows, and Linux.`}
      />
    </PageShell>
  );
}
