import { Github, Download } from "lucide-react";
import { site } from "@/lib/site";

/**
 * Standard end-of-page call to action for subpages. Links to the homepage
 * download section (which holds the full per-platform picker) and to GitHub,
 * so no per-page release fetch is needed.
 */
export function ConversionCTA({
  heading = "Try OpenBroca free",
  subheading = "Free and open source. Dictate into any app on macOS, Windows, and Linux — with the cloud or local models you choose.",
}: {
  heading?: string;
  subheading?: string;
}) {
  return (
    <section className="container-px py-16 md:py-24">
      <div className="relative overflow-hidden rounded-3xl border border-line bg-bg-elevated/50 px-8 py-14 text-center md:px-16">
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-[-6rem] h-72 w-72 -translate-x-1/2 rounded-full bg-brand/25 blur-[120px]"
        />
        <div className="relative mx-auto max-w-2xl">
          <h2 className="font-display text-3xl tracking-tight text-white md:text-4xl">
            {heading}
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-white/60">
            {subheading}
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href="/#download"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-brand px-6 text-base font-semibold text-brand-foreground shadow-[0_8px_30px_-8px_rgba(255,68,5,0.7)] transition hover:bg-brand-soft"
            >
              <Download className="size-5" strokeWidth={2.25} />
              Download free
            </a>
            <a
              href={site.repo}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-line-strong px-6 text-base font-semibold text-white transition hover:border-white/25"
            >
              <Github className="size-5" />
              View on GitHub
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
