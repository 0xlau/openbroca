import { Reveal } from "../reveal";

export function Philosophy() {
  return (
    <section className="pt-24 pb-6 md:pt-32">
      <div className="container-px">
        <Reveal>
          <figure className="mx-auto max-w-4xl text-center">
          <blockquote className="font-display text-3xl leading-snug tracking-tight text-white sm:text-4xl md:text-5xl md:leading-[1.15]">
            “Computers should hear you before they read your mind. Voice should
            be a{" "}
            <span className="text-brand">first-class input layer</span> — not a
            narrow dictation box locked to one vendor, one model, or one
            workflow.”
          </blockquote>
          <figcaption className="mt-8 text-sm text-white/50">
            — The belief OpenBroca is built around
          </figcaption>
          </figure>
        </Reveal>
      </div>
    </section>
  );
}
