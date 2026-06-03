import type { Metadata } from "next";
import { ogImage, site } from "@/lib/site";
import { ToolPage } from "@/components/tool-page";
import { SpeechTimeCalculator } from "@/components/tools/speech-time-calculator";

const url = `${site.url}/tools/speech-time-calculator`;
const title = "Speech Time Calculator — words to minutes (free)";
const description =
  "Free speech time calculator. Paste your script to estimate how long it takes to say aloud, or convert words to speaking minutes at slow, average, and fast paces. No sign-up, no microphone.";

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

export default function SpeechTimeCalculatorPage() {
  return (
    <ToolPage
      slug="speech-time-calculator"
      eyebrow="Speech time calculator"
      title="How long will your speech take?"
      schemaName="Speech Time Calculator"
      schemaDescription={description}
      lead="Paste your script and instantly see how long it takes to say aloud — at slow, average, and fast speaking speeds. Perfect for talks, videos, and presentations. No microphone needed."
      tool={<SpeechTimeCalculator />}
      sections={[
        {
          heading: "Words to speaking time, at a glance",
          body: (
            <p>
              Speaking time depends on how many words you have and how fast you
              say them. As a rule of thumb, an average speaker covers about 130
              words per minute, so a 650-word script runs roughly five minutes.
              Paste your text above to get an exact estimate for your wording, and
              compare slow, average, and fast delivery side by side.
            </p>
          ),
        },
        {
          heading: "Handy reference points",
          body: (
            <ul className="list-disc space-y-2 pl-5 marker:text-white/40">
              <li>1-minute talk ≈ 130 words</li>
              <li>3-minute pitch ≈ 390 words</li>
              <li>5-minute presentation ≈ 650 words</li>
              <li>10-minute talk ≈ 1,300 words</li>
              <li>TED-style 18-minute talk ≈ 2,300 words</li>
            </ul>
          ),
        },
        {
          heading: "Tips for timing a talk",
          body: (
            <ul className="list-disc space-y-2 pl-5 marker:text-white/40">
              <li>Add time for pauses, audience reactions, and slide changes.</li>
              <li>Read aloud once and adjust the words-per-minute slider to match your real pace.</li>
              <li>Build in a buffer — most people speed up when nervous.</li>
              <li>
                Drafting by voice instead of typing?{" "}
                <a
                  href="/tools/speech-to-text"
                  className="text-white/80 underline-offset-4 hover:text-white hover:underline"
                >
                  Dictate your script
                </a>{" "}
                first, then paste it here.
              </li>
            </ul>
          ),
        },
      ]}
      faqs={[
        {
          q: "How many words is a 5-minute speech?",
          a: "At an average pace of about 130 words per minute, a 5-minute speech is roughly 650 words. Slower delivery (~100 wpm) is about 500 words; faster (~160 wpm) is about 800.",
        },
        {
          q: "How many words per minute do people speak?",
          a: "Conversational and presentation speech is typically 120–150 words per minute. This calculator defaults to 130 and lets you adjust the pace.",
        },
        {
          q: "Does this need my microphone?",
          a: "No. The speech time calculator is pure text math — it never asks for microphone access and nothing is uploaded.",
        },
        {
          q: "Is reading time the same as speaking time?",
          a: "No. Silent reading is much faster (around 240 words per minute), while speaking aloud is slower. This tool estimates spoken delivery time.",
        },
        {
          q: "Is it free?",
          a: "Yes — completely free, with no account and no limits.",
        },
      ]}
      ctaHeading="Write your script by speaking it"
      ctaSubheading="OpenBroca turns your voice into text in any app, free and open source — draft talks and notes hands-free on macOS, Windows, and Linux."
    />
  );
}
