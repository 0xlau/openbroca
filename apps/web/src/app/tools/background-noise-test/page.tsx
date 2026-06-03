import type { Metadata } from "next";
import { ogImage, site } from "@/lib/site";
import { ToolPage } from "@/components/tool-page";
import { BackgroundNoiseTest } from "@/components/tools/background-noise-test";

const url = `${site.url}/tools/background-noise-test`;
const title = "Background Noise Test — check your room & mic noise (free)";
const description =
  "Free background noise test. Measure the ambient noise your microphone picks up and see whether your room is quiet enough for calls, recording, or dictation. Runs in your browser, nothing uploaded.";

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

export default function BackgroundNoiseTestPage() {
  return (
    <ToolPage
      slug="background-noise-test"
      eyebrow="Background noise test"
      title="Test your background noise"
      schemaName="Background Noise Test"
      schemaDescription={description}
      lead="Measure how much ambient noise your microphone is picking up and get a quick verdict on whether your space is quiet enough for calls, recording, or dictation. Stay silent and let it read the room."
      tool={<BackgroundNoiseTest />}
      sections={[
        {
          heading: "Why background noise matters",
          body: (
            <p>
              Background noise is the steady hum your microphone hears when
              you&apos;re not talking — fans, air conditioning, traffic, computer
              whirr, or a noisy room. Too much of it makes calls tiring, recordings
              sound amateur, and speech-to-text less accurate. Measuring your noise
              floor helps you decide whether to move, mute a fan, or switch to a
              closer or better microphone.
            </p>
          ),
        },
        {
          heading: "How to read the result",
          body: (
            <p>
              Start the test and stay quiet for a few seconds while the reading
              settles. The number is a relative level in dBFS — lower (more
              negative) is quieter. Use it to compare: try the test, change
              something (close a window, move the mic), and test again to see the
              difference. It&apos;s a relative gauge, not a calibrated decibel
              (dB SPL) meter.
            </p>
          ),
        },
        {
          heading: "Cutting background noise",
          body: (
            <ul className="list-disc space-y-2 pl-5 marker:text-white/40">
              <li>Move closer to the microphone so your voice dominates.</li>
              <li>Turn off fans, AC, or noisy appliances while recording.</li>
              <li>Use a headset or directional mic instead of a laptop&apos;s built-in one.</li>
              <li>Add soft furnishings to reduce echo in a bare room.</li>
              <li>
                Then{" "}
                <a
                  href="/tools/mic-test-recording"
                  className="text-white/80 underline-offset-4 hover:text-white hover:underline"
                >
                  record a clip and play it back
                </a>{" "}
                to hear the improvement.
              </li>
            </ul>
          ),
        },
      ]}
      faqs={[
        {
          q: "Is this a real decibel (dB) meter?",
          a: "Not exactly. Browsers can't access calibrated sound-pressure levels, so the reading is a relative level in dBFS. It's reliable for comparing rooms and setups, but not for exact dB SPL figures.",
        },
        {
          q: "Does it record or upload my audio?",
          a: "No. The microphone signal is analysed live in your browser to compute a level. Nothing is recorded, stored, or uploaded.",
        },
        {
          q: "What's a quiet enough noise floor?",
          a: "Lower is better. The tool labels readings from 'very quiet' to 'very noisy' — aim for 'quiet' or 'very quiet' for clean recordings and accurate dictation.",
        },
        {
          q: "Why should I stay silent during the test?",
          a: "The goal is to measure background noise, not your voice. Staying quiet lets the reading settle on the ambient noise floor of your room and setup.",
        },
        {
          q: "Which browsers are supported?",
          a: "The latest Chrome, Edge, Firefox, and Safari work, and the page must be served over HTTPS to access the microphone.",
        },
      ]}
      ctaHeading="Quiet room? Put your voice to work"
      ctaSubheading="OpenBroca turns clean audio into text in any app — free, open source, with on-device models that keep your voice private."
    />
  );
}
