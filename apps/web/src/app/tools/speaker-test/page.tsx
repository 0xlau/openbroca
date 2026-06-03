import type { Metadata } from "next";
import { ogImage, site } from "@/lib/site";
import { ToolPage } from "@/components/tool-page";
import { SpeakerTest } from "@/components/tools/speaker-test";

const url = `${site.url}/tools/speaker-test`;
const title = "Speaker Test — test speakers & headphones online (free)";
const description =
  "Free online speaker test. Play test tones, check your left and right channels, and sweep frequencies to test speakers or headphones — right in your browser. No microphone permission needed.";

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

export default function SpeakerTestPage() {
  return (
    <ToolPage
      slug="speaker-test"
      eyebrow="Speaker & headphone test"
      title="Test your speakers and headphones"
      schemaName="Speaker & Headphone Test"
      schemaDescription={description}
      lead="Play test tones through the left and right channels, sweep across frequencies, and confirm your speakers or headphones work — all in your browser. No microphone access required."
      tool={<SpeakerTest />}
      sections={[
        {
          heading: "Check left and right channels",
          body: (
            <p>
              Press <span className="text-white/85">Left</span>,{" "}
              <span className="text-white/85">Both</span>, and{" "}
              <span className="text-white/85">Right</span> in turn. You should
              hear the tone only from the matching side, then from both. If a side
              is silent or the channels are swapped, check your cable, balance
              settings, and which output device is selected in your system.
            </p>
          ),
        },
        {
          heading: "Sweep the frequency range",
          body: (
            <p>
              The frequency sweep glides from a low rumble up to a high tone. On
              healthy speakers or headphones you&apos;ll hear a smooth, continuous
              rise. Drop-outs, buzzing, or rattling can point to a blown driver, a
              loose enclosure, or the limits of small laptop speakers. Use the
              frequency slider to hold a single tone and probe a specific range.
            </p>
          ),
        },
        {
          heading: "Hearing-safe testing",
          body: (
            <p>
              Start with the volume low and raise it gradually — sustained tones,
              especially high frequencies on headphones, can be surprisingly loud.
              This tool only plays sound out; it never uses your microphone. To
              check the other half of your setup, try the{" "}
              <a
                href="/tools/microphone-test"
                className="text-white/80 underline-offset-4 hover:text-white hover:underline"
              >
                microphone test
              </a>
              .
            </p>
          ),
        },
      ]}
      faqs={[
        {
          q: "Does this speaker test need my microphone?",
          a: "No. It only plays test tones through your speakers or headphones using the Web Audio API. It never requests microphone access.",
        },
        {
          q: "How do I test left and right channels?",
          a: "Use the Left, Both, and Right buttons. Each plays a tone panned to that side so you can confirm both channels work and aren't swapped.",
        },
        {
          q: "What is the frequency sweep for?",
          a: "It glides from low to high frequencies so you can hear whether your speakers reproduce the whole range smoothly, without drop-outs, buzzing, or rattles.",
        },
        {
          q: "Why can't I hear the lowest or highest tones?",
          a: "Small speakers and earbuds can't reproduce deep bass or very high treble, and human hearing rolls off at the extremes too. Faint or missing tones at the far ends are normal.",
        },
        {
          q: "Is it free?",
          a: "Yes — free, no account, and it works in any modern browser.",
        },
      ]}
      ctaHeading="Speakers good? Make your voice an input too"
      ctaSubheading="OpenBroca is free, open-source voice dictation — speak and your words land in any app on macOS, Windows, and Linux."
    />
  );
}
