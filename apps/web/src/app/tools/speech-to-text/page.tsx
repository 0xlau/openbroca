import type { Metadata } from "next";
import { ogImage, site } from "@/lib/site";
import { ToolPage } from "@/components/tool-page";
import { SpeechToText } from "@/components/tools/speech-to-text";

const url = `${site.url}/tools/speech-to-text`;
const title = "Speech to Text Online — free voice typing in your browser";
const description =
  "Free online speech-to-text. Dictate and watch your words appear in real time, in 12 languages — then copy the text. Runs in your browser. For offline, on-device dictation into any app, use OpenBroca.";

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

export default function SpeechToTextPage() {
  return (
    <ToolPage
      slug="speech-to-text"
      eyebrow="Speech to text"
      title="Speech to text, online and free"
      schemaName="Speech to Text (Online)"
      schemaDescription={description}
      lead="Dictate in your browser and watch your speech become text in real time, in 12 languages. Copy the result anywhere. It's a live preview of what voice typing feels like."
      tool={<SpeechToText />}
      sections={[
        {
          heading: "Turn your voice into text in real time",
          body: (
            <p>
              Press start, allow the microphone, and speak naturally — your words
              are transcribed live as you talk, with interim results shown in
              grey before they&apos;re finalised. Pick from a dozen languages,
              keep dictating across pauses, and copy the finished text into an
              email, document, or message. It&apos;s a fast way to draft hands-free
              or just to see how accurate modern speech recognition has become.
            </p>
          ),
        },
        {
          heading: "Browser speech-to-text vs OpenBroca",
          body: (
            <>
              <p>
                This tool uses your browser&apos;s built-in Web Speech API. It&apos;s
                great for a quick demo, but it has real limits:
              </p>
              <ul className="list-disc space-y-2 pl-5 marker:text-white/40">
                <li>
                  It only types into <em>this page</em> — not into your editor,
                  chat, or terminal.
                </li>
                <li>
                  Support is uneven: it works best in Chrome and Edge and is
                  missing in some browsers entirely.
                </li>
                <li>
                  Depending on the browser, your audio may be sent to the
                  vendor&apos;s servers to be recognised.
                </li>
              </ul>
              <p>
                {site.name} fixes all three: it types into{" "}
                <span className="text-white/85">any</span> app system-wide, runs
                on macOS, Windows, and Linux, and can recognise speech{" "}
                <span className="text-white/85">fully on-device</span> so your
                audio never leaves your machine. Read more about{" "}
                <a
                  href="/offline-speech-to-text"
                  className="text-white/80 underline-offset-4 hover:text-white hover:underline"
                >
                  offline speech-to-text
                </a>{" "}
                or{" "}
                <a
                  href="/open-source-dictation"
                  className="text-white/80 underline-offset-4 hover:text-white hover:underline"
                >
                  open-source dictation
                </a>
                .
              </p>
            </>
          ),
        },
        {
          heading: "Tips for better accuracy",
          body: (
            <ul className="list-disc space-y-2 pl-5 marker:text-white/40">
              <li>Use a decent microphone in a quiet room.</li>
              <li>Speak at a steady, natural pace — no need to over-enunciate.</li>
              <li>Pick the language and accent variant that matches your speech.</li>
              <li>Say punctuation explicitly (e.g. &ldquo;comma&rdquo;) where the engine supports it.</li>
            </ul>
          ),
        },
      ]}
      faqs={[
        {
          q: "Is this speech-to-text free?",
          a: "Yes. It's free, requires no account, and has no usage limits — it uses the speech engine already built into your browser.",
        },
        {
          q: "Does it work offline?",
          a: "Not reliably — most browsers send audio to the vendor's servers for recognition. For truly offline, on-device dictation, OpenBroca can run local models so your audio never leaves your machine.",
        },
        {
          q: "Why doesn't it work in my browser?",
          a: "The Web Speech API isn't available everywhere — Firefox and some browsers don't ship it. Use the latest Chrome or Edge, or install OpenBroca for cross-platform dictation.",
        },
        {
          q: "What languages are supported?",
          a: "This demo offers 12 common languages including English, Spanish, French, German, Chinese, Japanese, and more. OpenBroca supports many more through its choice of recognition providers.",
        },
        {
          q: "Can I dictate into other apps with this?",
          a: "No — the browser tool only types into this page. OpenBroca delivers recognised text into whatever app is focused, system-wide on macOS, Windows, and Linux.",
        },
      ]}
      ctaHeading="Dictate into any app, not just this page"
      ctaSubheading="OpenBroca is free, open-source voice dictation. Speak and your words land in any app — with cloud or fully on-device models you choose."
    />
  );
}
