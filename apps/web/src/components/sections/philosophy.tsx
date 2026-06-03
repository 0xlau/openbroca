import { Reveal } from "../reveal";

export function Philosophy() {
  return (
    <section className="pt-24 pb-6 md:pt-32">
      <div className="container-px">
        <Reveal>
          <figure className="mx-auto max-w-4xl text-center">
            <p className="font-display text-4xl leading-[1.1] tracking-tight text-white sm:text-5xl md:text-6xl">
              After keyboards.{" "}
              <img
                src="/app-icon.png"
                alt="OpenBroca"
                width={256}
                height={256}
                className="mx-1 inline-block size-11 -translate-y-1 align-middle drop-shadow-[0_12px_34px_rgba(255,68,5,0.5)] sm:size-12 md:size-14"
              />{" "}
              Before brain interfaces.
            </p>
            <blockquote className="mx-auto mt-10 max-w-3xl text-xl leading-snug tracking-tight text-white/80 sm:text-2xl md:text-3xl md:leading-[1.3]">
              “Computers should hear you before they read your mind. Voice should
              be a{" "}
              <span className="text-brand">first-class input layer</span> — not
              a narrow dictation box locked to one vendor, one model, or one
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
