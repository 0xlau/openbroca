import { ProviderMarquee } from "../provider-marquee";
import { Reveal } from "../reveal";

export function Providers() {
  return (
    <section
      id="providers"
      className="scroll-mt-20 overflow-hidden border-y border-line bg-bg-elevated/30 py-24 md:py-32"
    >
      <div className="container-px">
        <Reveal className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-widest text-brand">
            Bring your own models
          </p>
          <h2 className="mt-3 font-display text-4xl tracking-tight text-white md:text-5xl">
            Plug in any provider you trust.
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-white/60">
            OpenBroca speaks to speech and language providers through open
            interfaces. Mix cloud and local, swap models per task, and add your
            own — nothing is hard-wired.
          </p>
        </Reveal>
      </div>

      {/* Full-bleed marquee for an edge-to-edge scroll */}
      <Reveal delay={120} className="mt-14">
        <ProviderMarquee />
      </Reveal>

      <div className="container-px">
        <Reveal delay={200}>
          <p className="mt-12 text-sm text-white/45">
            2 speech-recognition engines · 16+ language models · all swappable.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
