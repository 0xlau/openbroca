import type { Metadata } from "next";
import { ogImage, site } from "@/lib/site";
import { ToolPage } from "@/components/tool-page";
import { SpeakingSpeedTest } from "@/components/tools/speaking-speed-test";

const url = `${site.url}/tools/speaking-speed-test`;
const title = "Speaking Speed Test — measure your words per minute (free)";
const description =
  "Free speaking speed test. Talk for a few seconds and get your words-per-minute (WPM) with a rating from relaxed to very fast. Runs in your browser — nothing is uploaded.";

export const metadata: Metadata = {
  title: { absolute: `${title} — ${site.name}` },
  description,
  alternates: { canonical: url },
  openGraph: {
    type: "article",
    url,
    title: `${title} — ${site.name}`,
    description,
    siteName: site.name,
    images: [ogImage],
  },
  twitter: {
    card: "summary_large_image",
    title: `${title} — ${site.name}`,
    description,
    images: [ogImage.url],
  },
};

export default function SpeakingSpeedTestPage() {
  return (
    <ToolPage
      slug="speaking-speed-test"
      eyebrow="Speaking speed test"
      title="How fast do you speak?"
      schemaName="Speaking Speed (WPM) Test"
      schemaDescription={description}
      lead="Talk naturally for 20–30 seconds and this tool measures your speaking speed in words per minute, then tells you how it compares. Great prep for talks, podcasts, and presentations."
      tool={<SpeakingSpeedTest />}
      sections={[
        {
          heading: "What's a good speaking pace?",
          body: (
            <>
              <p>
                Most people speak at roughly 120–150 words per minute in
                conversation. The right pace depends on context:
              </p>
              <ul className="list-disc space-y-2 pl-5 marker:text-white/40">
                <li>
                  <span className="text-white/85">Presentations &amp; speeches:</span>{" "}
                  ~120–140 wpm keeps you clear and easy to follow.
                </li>
                <li>
                  <span className="text-white/85">Podcasts &amp; conversation:</span>{" "}
                  ~140–160 wpm feels natural and lively.
                </li>
                <li>
                  <span className="text-white/85">Audiobooks &amp; narration:</span>{" "}
                  ~150–160 wpm is a common target.
                </li>
              </ul>
              <p>
                If you land above ~185 wpm, slowing down and adding pauses usually
                makes you easier to understand.
              </p>
            </>
          ),
        },
        {
          heading: "How it works",
          body: (
            <p>
              The tool uses your browser&apos;s speech recognition to count the
              words you say while timing how long you speak, then divides words by
              minutes to get your WPM. Speak for at least 20–30 seconds for a
              reliable number, and read or talk the way you normally would rather
              than rushing.
            </p>
          ),
        },
        {
          heading: "Want the count to be exact?",
          body: (
            <p>
              Browser speech recognition is good but not perfect, so the word
              count is an estimate. For accurate, private transcription that types
              into any app — with on-device models so your audio stays local —{" "}
              <a
                href="/#download"
                className="text-white/80 underline-offset-4 hover:text-white hover:underline"
              >
                use {site.name}
              </a>
              .
            </p>
          ),
        },
      ]}
      faqs={[
        {
          q: "How is words per minute calculated?",
          a: "The tool transcribes your speech with the browser's speech recognition, counts the words, and divides by the time you spoke (in minutes). Speak for 20–30+ seconds for a stable reading.",
        },
        {
          q: "What is a normal speaking speed?",
          a: "Conversational English is usually around 120–150 wpm. Presentations are often a bit slower (120–140) for clarity, while lively podcasts can run 140–160.",
        },
        {
          q: "Is it free and private?",
          a: "It's free with no account. The measurement runs in your browser, though browser speech recognition may send audio to the browser vendor's servers, depending on the browser.",
        },
        {
          q: "Why doesn't it work in my browser?",
          a: "The Web Speech API isn't available everywhere — Firefox and some browsers don't include it. Use the latest Chrome or Edge.",
        },
        {
          q: "Why is the word count slightly off?",
          a: "Speech recognition can mishear words, especially with background noise or accents, so the count is an estimate. A quiet room and a good mic improve accuracy.",
        },
      ]}
      ctaHeading="Turn your voice into text, accurately"
      ctaSubheading="OpenBroca is free, open-source dictation that types into any app on macOS, Windows, and Linux — with cloud or on-device models you choose."
    />
  );
}
