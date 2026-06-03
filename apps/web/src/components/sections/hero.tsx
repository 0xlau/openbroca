import { Github, Star } from "lucide-react";
import { site } from "@/lib/site";
import type { Downloads } from "@/lib/releases";
import { DownloadButton } from "../download-button";
import { Reveal } from "../reveal";
import { ShinyText } from "../shiny-text";
import SoftAurora from "../soft-aurora";

export function Hero({ downloads }: { downloads: Downloads }) {
  return (
    <section className="relative overflow-hidden">
      {/* Soft Aurora background (reactbits.dev/backgrounds/soft-aurora) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      >
        <SoftAurora
          className="absolute inset-0 h-full w-full"
          color1="#ff9a3d"
          color2="#ff2d7a"
          brightness={1.15}
          speed={1}
          scale={1.6}
          bandHeight={0.34}
          enableMouseInteraction={false}
        />
        {/* dotted texture + readability / blend scrim */}
        <div className="absolute inset-0 bg-dots opacity-60 [mask-image:radial-gradient(ellipse_at_top,black_20%,transparent_72%)]" />
        <div className="absolute inset-0 bg-gradient-to-b from-bg/75 via-bg/30 to-bg" />
      </div>

      <div className="container-px relative flex flex-col items-center pt-24 pb-20 text-center md:pt-32 md:pb-28">
        <Reveal>
          <a
            href={site.repo}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-line bg-bg-elevated/60 px-3.5 py-1.5 text-xs font-medium backdrop-blur transition hover:border-line-strong"
          >
            <Star className="size-3.5 text-brand" strokeWidth={2.5} />
            <ShinyText text="Open source · MIT licensed · Star us on GitHub" />
          </a>
        </Reveal>

        <Reveal delay={80}>
          <h1 className="mt-7 max-w-4xl text-balance font-display text-5xl leading-[1.1] tracking-tight text-white sm:text-6xl md:text-7xl">
            After keyboards.{" "}
            <img
              src="/app-icon.png"
              alt="OpenBroca"
              width={256}
              height={256}
              className="mx-1 inline-block size-12 -translate-y-1 align-middle drop-shadow-[0_12px_34px_rgba(255,68,5,0.5)] sm:size-14 md:size-[4.25rem]"
            />{" "}
            Before brain interfaces.
          </h1>
        </Reveal>

        <Reveal delay={160}>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-white/65">
            OpenBroca turns speech into text, intent into action, and your voice
            into a system-wide input layer. Dictate into any app — with the
            cloud or local models you choose.
          </p>
        </Reveal>

        <Reveal delay={240}>
          <div className="mt-9 flex flex-col items-center gap-4 sm:flex-row">
            <DownloadButton downloads={downloads} />
            <a
              href={site.repo}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-line-strong bg-bg-elevated/50 px-6 text-base font-semibold text-white backdrop-blur transition hover:border-white/25 hover:bg-bg-elevated"
            >
              <Github className="size-5" />
              View on GitHub
            </a>
          </div>
        </Reveal>

        <Reveal delay={320}>
          <p className="mt-5 text-sm text-white/45">
            Free &amp; open source · macOS, Windows &amp; Linux · v
            {downloads.version}
          </p>
        </Reveal>
      </div>
    </section>
  );
}
