import type { Metadata } from "next";
import { WifiOff, ShieldCheck, Cpu, Cloud } from "lucide-react";
import { ogImage, site } from "@/lib/site";
import { PageShell } from "@/components/page-shell";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { ConversionCTA } from "@/components/conversion-cta";

const url = `${site.url}/offline-speech-to-text`;

export const metadata: Metadata = {
  title: { absolute: "Offline speech-to-text & local dictation — OpenBroca" },
  description:
    "Run speech-to-text fully offline with OpenBroca. On-device models (Sherpa-ONNX) keep your audio on your machine — private, local dictation for macOS, Windows, and Linux.",
  alternates: { canonical: url },
  openGraph: {
    type: "article",
    url,
    title: "Offline speech-to-text & local dictation — OpenBroca",
    description:
      "Private, on-device speech-to-text. Audio never leaves your machine. Free and open source for macOS, Windows, and Linux.",
    siteName: site.name,
    images: [ogImage],
  },
  twitter: {
    card: "summary_large_image",
    title: "Offline speech-to-text & local dictation — OpenBroca",
    description:
      "Private, on-device speech-to-text. Audio never leaves your machine. Free and open source for macOS, Windows, and Linux.",
    images: [ogImage.url],
  },
};

const benefits = [
  {
    icon: ShieldCheck,
    title: "Audio never leaves your device",
    body: "On-device recognition means your voice isn't streamed to a server — nothing to intercept, log, or retain.",
  },
  {
    icon: WifiOff,
    title: "Works without internet",
    body: "Dictate on a plane, in a secure facility, or on a flaky connection. Local models don't need a network.",
  },
  {
    icon: Cpu,
    title: "No per-minute cloud cost",
    body: "Once a model is downloaded, transcription runs on hardware you already own — no metered API usage.",
  },
  {
    icon: Cloud,
    title: "Cloud is still one click away",
    body: "Prefer maximum accuracy or speed for a task? Switch to a cloud provider per workflow — you decide.",
  },
];

export default function OfflineSpeechToTextPage() {
  return (
    <PageShell>
      <article className="container-px pt-12 pb-4 md:pt-16">
        <Breadcrumbs
          items={[
            { label: "Home", href: "/" },
            {
              label: "Offline speech-to-text",
              href: "/offline-speech-to-text",
            },
          ]}
        />

        <header className="mt-8 max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-widest text-brand">
            Offline speech-to-text
          </p>
          <h1 className="mt-3 font-display text-4xl tracking-tight text-white md:text-5xl">
            Offline speech-to-text that keeps your voice on your machine
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-white/70">
            OpenBroca can run speech recognition entirely on-device, so your
            audio is transcribed locally and never sent to the cloud. It&apos;s
            free, open source, and works across macOS, Windows, and Linux — with
            cloud models always available when you want them.
          </p>
        </header>

        <div className="mt-14 max-w-3xl space-y-14">
          <section>
            <h2 className="font-display text-2xl tracking-tight text-white md:text-3xl">
              What is offline speech-to-text?
            </h2>
            <p className="mt-4 text-base leading-relaxed text-white/65">
              Offline (or on-device) speech-to-text converts your voice into
              text using a model that runs locally on your own computer, rather
              than streaming audio to a remote server for processing. The
              practical difference is large: with cloud dictation your spoken
              words travel to a third party; with offline dictation they stay on
              the machine in front of you. For anyone handling confidential
              work — legal, medical, journalistic, or simply private — that
              boundary matters.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl tracking-tight text-white md:text-3xl">
              Why use offline dictation?
            </h2>
            <div className="mt-8 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2">
              {benefits.map(({ icon: Icon, title, body }) => (
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
              How OpenBroca runs speech-to-text locally
            </h2>
            <p className="mt-4 text-base leading-relaxed text-white/65">
              OpenBroca uses Sherpa-ONNX to run modern speech-recognition models
              directly on your device — download a model once and dictate with
              no network round-trip. Recognition is exposed through the same open
              interface as cloud engines like Deepgram, so switching between
              local and cloud is a setting, not a migration. Any API keys you do
              use for cloud providers are stored in OS-backed secure storage, and
              because the whole app is open source, you can confirm in the code
              that local means local. Recognized text is dropped straight into
              whatever app is focused, and you can route it through a
              language-model step to clean up or reformat it afterward.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl tracking-tight text-white md:text-3xl">
              Offline vs cloud: when to use each
            </h2>
            <p className="mt-4 text-base leading-relaxed text-white/65">
              Local models give you privacy and offline availability and are
              more than good enough for everyday dictation. Cloud models can
              offer an edge in raw accuracy, latency, or breadth of language
              support, at the cost of sending audio off-device and (usually)
              paying per use. OpenBroca&apos;s point is that you shouldn&apos;t
              have to pick once and live with it — choose local when privacy
              wins, cloud when capability wins, per task. Learn more about
              OpenBroca&apos;s{" "}
              <a
                href="/open-source-dictation"
                className="text-white/80 underline-offset-4 hover:text-white hover:underline"
              >
                open-source approach to dictation
              </a>
              .
            </p>
          </section>
        </div>
      </article>

      <ConversionCTA
        heading="Dictate privately, offline"
        subheading="Free and open source. Run speech-to-text fully on-device on macOS, Windows, and Linux — and reach for the cloud only when you want to."
      />
    </PageShell>
  );
}
