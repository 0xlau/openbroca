import type { Metadata } from "next";
import { ogImage, site } from "@/lib/site";
import { ToolPage } from "@/components/tool-page";
import { TextToSpeech } from "@/components/tools/text-to-speech";

const url = `${site.url}/tools/text-to-speech`;
const title = "Text to Speech Online — free read-aloud in your browser";
const description =
  "Free online text-to-speech. Type or paste text, choose a voice, adjust speed and pitch, and hear it read aloud. Synthesized on-device by your system voices — nothing is uploaded.";

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

export default function TextToSpeechPage() {
  return (
    <ToolPage
      slug="text-to-speech"
      eyebrow="Text to speech"
      title="Text to speech, online and free"
      schemaName="Text to Speech (Online)"
      schemaDescription={description}
      lead="Type or paste any text, pick a voice, and hear it read aloud. Adjust speed and pitch to taste. Speech is synthesized on your device — nothing you type is uploaded."
      tool={<TextToSpeech />}
      sections={[
        {
          heading: "Read anything aloud",
          body: (
            <p>
              Paste an article, a draft, or a paragraph you want to proofread,
              choose one of your system&apos;s voices, and press play. Text-to-speech
              is a great way to catch awkward sentences, give your eyes a rest,
              learn pronunciation, or turn notes into something you can listen to.
              The speed and pitch controls let you slow things down for clarity or
              speed them up to skim.
            </p>
          ),
        },
        {
          heading: "On-device by design",
          body: (
            <p>
              This tool uses the Web Speech Synthesis API, so the voices come from
              your operating system and the audio is generated locally. Nothing
              you type is sent to a server. The available voices depend on your OS
              and browser — install more system voices to expand the list. It&apos;s
              the same local-first principle behind {site.name}: capable voice
              features that respect your privacy.
            </p>
          ),
        },
        {
          heading: "The other direction: your voice into text",
          body: (
            <p>
              Text-to-speech reads words out; {site.name} does the reverse and
              far more — it turns <em>your</em> speech into text and types it into
              any app you&apos;re using, on macOS, Windows, and Linux. Try the{" "}
              <a
                href="/tools/speech-to-text"
                className="text-white/80 underline-offset-4 hover:text-white hover:underline"
              >
                speech-to-text tool
              </a>{" "}
              to see it in the browser, or{" "}
              <a
                href="/#download"
                className="text-white/80 underline-offset-4 hover:text-white hover:underline"
              >
                download OpenBroca
              </a>{" "}
              for the real thing.
            </p>
          ),
        },
      ]}
      faqs={[
        {
          q: "Is this text-to-speech free?",
          a: "Yes. It's free with no account and no character limits, using the speech voices already installed on your device.",
        },
        {
          q: "Is anything I type uploaded?",
          a: "No. Speech is synthesized locally by your operating system's voices through the Web Speech API, so your text never leaves your device.",
        },
        {
          q: "Why are only a few voices listed?",
          a: "The voice list comes from your OS and browser. You can install additional system voices (and languages) to expand it, and they'll appear automatically.",
        },
        {
          q: "Can I download the audio?",
          a: "The Web Speech API plays speech but doesn't expose a file to download. For saving audio, record your own narration with our free online voice recorder.",
        },
        {
          q: "Which browsers are supported?",
          a: "The latest Chrome, Edge, Safari, and Firefox support speech synthesis. Available voices vary by browser and operating system.",
        },
      ]}
      ctaHeading="Voice in, text out — everywhere"
      ctaSubheading="OpenBroca turns your speech into text in any app, free and open source, with cloud or on-device models you choose."
    />
  );
}
