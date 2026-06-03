import type { Metadata } from "next";
import { Scale, GitFork, ShieldCheck, Shuffle } from "lucide-react";
import { ogImage, site } from "@/lib/site";
import { PageShell } from "@/components/page-shell";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { ConversionCTA } from "@/components/conversion-cta";

const url = `${site.url}/open-source-dictation`;

export const metadata: Metadata = {
  title: { absolute: "Open-source voice dictation — OpenBroca" },
  description:
    "OpenBroca is free, MIT-licensed open-source voice dictation. Dictate into any app with cloud or fully local speech-to-text — auditable, private, and never locked to one vendor.",
  alternates: { canonical: url },
  openGraph: {
    type: "article",
    url,
    title: "Open-source voice dictation — OpenBroca",
    description:
      "Free, MIT-licensed open-source voice dictation. Cloud or fully local speech-to-text, no vendor lock-in.",
    siteName: site.name,
    images: [ogImage],
  },
  twitter: {
    card: "summary_large_image",
    title: "Open-source voice dictation — OpenBroca",
    description:
      "Free, MIT-licensed open-source voice dictation. Cloud or fully local speech-to-text, no vendor lock-in.",
    images: [ogImage.url],
  },
};

const pillars = [
  {
    icon: Scale,
    title: "Free and permissively licensed",
    body: "MIT-licensed means you can use, fork, and ship OpenBroca with no subscription and no usage caps.",
  },
  {
    icon: GitFork,
    title: "Auditable, not a black box",
    body: "Every line is on GitHub. Read exactly how recognition and rewriting work — and how your audio is handled.",
  },
  {
    icon: ShieldCheck,
    title: "Private by design",
    body: "Run models fully on-device so audio never leaves your machine, with credentials in OS-backed secure storage.",
  },
  {
    icon: Shuffle,
    title: "No vendor lock-in",
    body: "Swap between 16+ language models and two speech engines through open interfaces. Your workflow is yours.",
  },
];

export default function OpenSourceDictationPage() {
  return (
    <PageShell>
      <article className="container-px pt-12 pb-4 md:pt-16">
        <Breadcrumbs
          items={[
            { label: "Home", href: "/" },
            { label: "Open-source dictation", href: "/open-source-dictation" },
          ]}
        />

        <header className="mt-8 max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-widest text-brand">
            Open-source voice dictation
          </p>
          <h1 className="mt-3 font-display text-4xl tracking-tight text-white md:text-5xl">
            Open-source voice dictation you can actually trust
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-white/70">
            OpenBroca is free, MIT-licensed voice dictation built in the open.
            Speak into any app and have your words turned into polished text —
            using cloud providers for speed or fully local models for privacy,
            with nothing hidden behind a closed binary or a subscription.
          </p>
        </header>

        <div className="mt-14 max-w-3xl space-y-14">
          <section>
            <h2 className="font-display text-2xl tracking-tight text-white md:text-3xl">
              What is open-source dictation?
            </h2>
            <p className="mt-4 text-base leading-relaxed text-white/65">
              Open-source dictation is voice-to-text software whose source code
              is published under a license that lets anyone read, modify, and
              redistribute it. Instead of trusting a vendor's marketing claims
              about how your speech is processed, you (or anyone in the
              community) can inspect the code and verify it. Most popular
              dictation apps — Wispr Flow, Typeless, Monologue — are polished but
              closed-source commercial products. OpenBroca takes the opposite
              approach: the entire app is open and free.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl tracking-tight text-white md:text-3xl">
              Why open source matters for dictation
            </h2>
            <p className="mt-4 text-base leading-relaxed text-white/65">
              Dictation is uniquely sensitive: it captures your raw voice and
              everything you say — drafts, messages, private notes. That makes
              transparency and control more than nice-to-haves.
            </p>
            <div className="mt-8 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2">
              {pillars.map(({ icon: Icon, title, body }) => (
                <div key={title} className="bg-bg p-7">
                  <div className="inline-flex size-10 items-center justify-center rounded-xl border border-line-strong bg-brand/10 text-brand">
                    <Icon className="size-5" strokeWidth={2} />
                  </div>
                  <h3 className="mt-4 text-lg font-semibold text-white">
                    {title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-white/55">
                    {body}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="font-display text-2xl tracking-tight text-white md:text-3xl">
              How OpenBroca delivers open-source dictation
            </h2>
            <p className="mt-4 text-base leading-relaxed text-white/65">
              OpenBroca turns speech into text and intent into action as a
              system-wide input layer — dictate into your editor, browser, chat,
              or terminal. Speech recognition runs through open interfaces, so
              you can pick Deepgram in the cloud for speed or Sherpa-ONNX
              entirely on-device for privacy. From there, your choice of 16+
              language-model providers can polish, translate, or summarize what
              you said. Because the code is MIT-licensed and on GitHub, you can
              audit those data paths, file issues, send pull requests, or fork
              the project entirely. It ships as native desktop builds for macOS,
              Windows, and Linux.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl tracking-tight text-white md:text-3xl">
              Open-source vs closed dictation apps
            </h2>
            <p className="mt-4 text-base leading-relaxed text-white/65">
              Commercial apps often win on first-run polish and managed
              convenience, and that is a legitimate reason to choose them. But
              they ask you to trust a closed stack, accept a recurring
              subscription, and stay on whichever models the vendor selects.
              Open-source dictation trades a little hand-holding for ownership:
              no lock-in, no per-seat fees, and the ability to verify and extend
              everything. See how OpenBroca stacks up against{" "}
              <a
                href="/vs/wispr-flow"
                className="text-white/80 underline-offset-4 hover:text-white hover:underline"
              >
                Wispr Flow
              </a>
              ,{" "}
              <a
                href="/vs/typeless"
                className="text-white/80 underline-offset-4 hover:text-white hover:underline"
              >
                Typeless
              </a>
              , and{" "}
              <a
                href="/vs/monologue"
                className="text-white/80 underline-offset-4 hover:text-white hover:underline"
              >
                Monologue
              </a>
              .
            </p>
          </section>
        </div>
      </article>

      <ConversionCTA
        heading="Start dictating with open source"
        subheading="Free and MIT-licensed. Dictate into any app on macOS, Windows, and Linux — with the cloud or fully local models you choose."
      />
    </PageShell>
  );
}
