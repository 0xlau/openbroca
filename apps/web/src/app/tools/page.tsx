import type { Metadata } from "next";
import {
  Mic,
  AudioLines,
  Disc3,
  Captions,
  Volume2,
  Gauge,
  Timer,
  Waves,
  Speaker,
  ArrowRight,
} from "lucide-react";
import { ogImage, site } from "@/lib/site";
import { PageShell } from "@/components/page-shell";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { ConversionCTA } from "@/components/conversion-cta";

const url = `${site.url}/tools`;

export const metadata: Metadata = {
  title: { absolute: "Free online voice & microphone tools — OpenBroca" },
  description:
    "Free, browser-based voice and audio tools: test your microphone, record and play back audio, dictate speech to text, and convert text to speech. No install, no account — everything runs in your browser.",
  alternates: { canonical: url },
  openGraph: {
    type: "website",
    url,
    title: "Free online voice & microphone tools — OpenBroca",
    description:
      "Test your microphone, record audio, dictate speech to text, and convert text to speech — free, in your browser.",
    siteName: site.name,
    images: [ogImage],
  },
  twitter: {
    card: "summary_large_image",
    title: "Free online voice & microphone tools — OpenBroca",
    description:
      "Test your microphone, record audio, dictate speech to text, and convert text to speech — free, in your browser.",
    images: [ogImage.url],
  },
};

const tools = [
  {
    icon: Mic,
    title: "Microphone test",
    href: "/tools/microphone-test",
    desc: "Check that your mic works and watch a live input-level meter. Pick the right input device in seconds.",
  },
  {
    icon: AudioLines,
    title: "Mic test — record & playback",
    href: "/tools/mic-test-recording",
    desc: "Record a short clip and play it straight back, so you can hear exactly how your microphone sounds.",
  },
  {
    icon: Disc3,
    title: "Online voice recorder",
    href: "/tools/voice-recorder",
    desc: "Record audio in your browser, pause and resume, then download the file. No install, no account.",
  },
  {
    icon: Captions,
    title: "Speech to text",
    href: "/tools/speech-to-text",
    desc: "Dictate and watch your speech become text in real time, in 12 languages — a live voice-typing demo.",
  },
  {
    icon: Volume2,
    title: "Text to speech",
    href: "/tools/text-to-speech",
    desc: "Type anything and hear it read aloud with on-device voices. Adjust the speed and pitch.",
  },
  {
    icon: Gauge,
    title: "Speaking speed (WPM) test",
    href: "/tools/speaking-speed-test",
    desc: "Speak naturally and find out your words-per-minute, with a rating from slow to fast.",
  },
  {
    icon: Timer,
    title: "Speech time calculator",
    href: "/tools/speech-time-calculator",
    desc: "Paste a script to estimate how long it takes to say aloud — no microphone needed.",
  },
  {
    icon: Waves,
    title: "Background noise test",
    href: "/tools/background-noise-test",
    desc: "Measure the ambient noise your mic picks up and see whether your room is quiet enough.",
  },
  {
    icon: Speaker,
    title: "Speaker & headphone test",
    href: "/tools/speaker-test",
    desc: "Play test tones and check your left and right channels — no microphone permission needed.",
  },
];

export default function ToolsHubPage() {
  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Free voice & audio tools by OpenBroca",
    itemListElement: tools.map((t, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: t.title,
      url: `${site.url}${t.href}`,
    })),
  };

  return (
    <PageShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemList) }}
      />

      <article className="container-px pt-12 pb-4 md:pt-16">
        <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Tools", href: "/tools" }]} />

        <header className="mt-8 max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-widest text-brand">
            Free tools
          </p>
          <h1 className="mt-3 font-display text-4xl tracking-tight text-white md:text-5xl">
            Free voice &amp; audio tools
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-white/70">
            A small kit of free, browser-based tools for working with your
            microphone and voice — no install, no sign-up, nothing uploaded.
            Test your mic, record and download audio, turn speech into text, and
            read text aloud. They&apos;re also a live taste of what {site.name}{" "}
            does on the desktop: voice as a real input layer.
          </p>
        </header>

        <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2">
          {tools.map(({ icon: Icon, title, href, desc }) => (
            <a
              key={href}
              href={href}
              className="group flex flex-col bg-bg p-7 transition hover:bg-bg-elevated"
            >
              <div className="inline-flex size-11 items-center justify-center rounded-xl border border-line-strong bg-brand/10 text-brand">
                <Icon className="size-5" strokeWidth={2} />
              </div>
              <h2 className="mt-4 flex items-center gap-1.5 text-lg font-semibold text-white">
                {title}
                <ArrowRight className="size-4 text-white/30 transition group-hover:translate-x-0.5 group-hover:text-brand" />
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-white/55">{desc}</p>
            </a>
          ))}
        </div>

        <div className="mt-16 max-w-3xl space-y-14">
          <section>
            <h2 className="font-display text-2xl tracking-tight text-white md:text-3xl">
              Private by default
            </h2>
            <p className="mt-4 text-base leading-relaxed text-white/65">
              Every tool here runs entirely in your browser using standard web
              APIs (getUserMedia, MediaRecorder, and the Web Speech API). Your
              microphone audio and text are processed on your device and are
              never sent to our servers — most tools don&apos;t even keep a
              recording once you reload the page. It&apos;s the same principle
              behind {site.name}: your voice should stay yours.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl tracking-tight text-white md:text-3xl">
              From browser demo to your whole desktop
            </h2>
            <p className="mt-4 text-base leading-relaxed text-white/65">
              These tools are handy on their own, but they only work inside this
              tab. {site.name} takes the same idea system-wide: speak and your
              words are typed into whatever app is focused — editors, browsers,
              chat, the terminal — using cloud or fully on-device models you
              choose. It&apos;s free and open source for macOS, Windows, and
              Linux.{" "}
              <a
                href="/#download"
                className="text-white/80 underline-offset-4 hover:text-white hover:underline"
              >
                Download OpenBroca
              </a>{" "}
              or read about{" "}
              <a
                href="/offline-speech-to-text"
                className="text-white/80 underline-offset-4 hover:text-white hover:underline"
              >
                offline speech-to-text
              </a>
              .
            </p>
          </section>
        </div>
      </article>

      <ConversionCTA
        heading="Voice as a first-class input"
        subheading="Free and open source. Take these tools further — dictate into any app on macOS, Windows, and Linux with the cloud or local models you choose."
      />
    </PageShell>
  );
}
