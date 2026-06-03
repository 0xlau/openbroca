import { Github, GitFork, Scale } from "lucide-react";
import { site } from "@/lib/site";
import { Reveal } from "../reveal";

const points = [
  {
    icon: Scale,
    title: "MIT licensed",
    description: "Permissive and free to use, fork, and ship.",
  },
  {
    icon: GitFork,
    title: "Built in the open",
    description: "Audit the code, file issues, and send pull requests.",
  },
  {
    icon: Github,
    title: "Community-driven",
    description: "Shape the providers, workflows, and roadmap with us.",
  },
];

export function OpenSource() {
  return (
    <section className="py-24 md:py-32">
      <div className="container-px">
        <div className="relative overflow-hidden rounded-3xl border border-line bg-bg-elevated/50 px-8 py-16 md:px-16 md:py-20">
          <div
            aria-hidden
            className="pointer-events-none absolute right-[-6rem] top-[-6rem] h-72 w-72 rounded-full bg-brand/25 blur-[120px]"
          />
          <Reveal className="relative mx-auto max-w-2xl text-center">
            <h2 className="font-display text-4xl tracking-tight text-white md:text-5xl">
              Open source, all the way down.
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-white/60">
              OpenBroca is free software built in public. No telemetry traps, no
              vendor lock-in — just a tool you can read, trust, and extend.
            </p>

            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a
                href={site.repo}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-brand px-6 text-base font-semibold text-brand-foreground shadow-[0_8px_30px_-8px_rgba(255,68,5,0.7)] transition hover:bg-brand-soft"
              >
                <Github className="size-5" />
                Star on GitHub
              </a>
              <a
                href={site.issues}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-12 items-center justify-center rounded-full border border-line-strong px-6 text-base font-semibold text-white transition hover:border-white/25"
              >
                Contribute
              </a>
            </div>
          </Reveal>

          <Reveal
            delay={140}
            className="relative mx-auto mt-14 grid max-w-3xl gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-3"
          >
            {points.map(({ icon: Icon, title, description }) => (
              <div key={title} className="bg-bg p-6 text-center">
                <Icon
                  className="mx-auto size-6 text-brand"
                  strokeWidth={2}
                />
                <h3 className="mt-3 text-sm font-semibold text-white">
                  {title}
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-white/55">
                  {description}
                </p>
              </div>
            ))}
          </Reveal>
        </div>
      </div>
    </section>
  );
}
