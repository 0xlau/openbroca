import type { Metadata } from "next";
import { ogImage, site } from "@/lib/site";
import { ToolPage } from "@/components/tool-page";
import { MicRecordingTest } from "@/components/tools/mic-recording-test";

const url = `${site.url}/tools/mic-test-recording`;
const title = "Mic Test with Recording & Playback (free, online)";
const description =
  "Free mic test with recording and playback. Record a short clip in your browser and play it straight back to hear exactly how your microphone sounds — no install, nothing uploaded.";

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

export default function MicRecordingTestPage() {
  return (
    <ToolPage
      slug="mic-test-recording"
      eyebrow="Mic test — record & playback"
      title="Mic test with recording and playback"
      schemaName="Mic Test with Recording & Playback"
      schemaDescription={description}
      lead="Record a short clip and play it right back — the surest way to hear exactly how your microphone sounds to other people. Everything stays in your browser."
      tool={<MicRecordingTest />}
      sections={[
        {
          heading: "Why record and play back?",
          body: (
            <p>
              A live level meter tells you a microphone is picking up sound, but
              it can&apos;t tell you how you actually sound — whether you&apos;re
              too quiet, clipping, echoey, or buried in background noise.
              Recording a few seconds and listening back is the quickest honest
              check before a call, interview, podcast, or voice message. This
              tool records locally, hands you a player, and forgets the clip the
              moment you record again or leave.
            </p>
          ),
        },
        {
          heading: "How to use it",
          body: (
            <ol className="list-decimal space-y-2 pl-5 marker:text-white/40">
              <li>
                Press <span className="text-white/85">Start recording</span> and
                allow microphone access.
              </li>
              <li>
                Speak for a few seconds the way you normally would on a call.
              </li>
              <li>
                Press <span className="text-white/85">Stop</span>, then play the
                clip back with the audio player.
              </li>
              <li>
                Too quiet, distorted, or noisy? Adjust your input volume or move
                closer to the mic and{" "}
                <span className="text-white/85">Record again</span>.
              </li>
            </ol>
          ),
        },
        {
          heading: "What to listen for",
          body: (
            <ul className="list-disc space-y-2 pl-5 marker:text-white/40">
              <li>
                <span className="text-white/85">Level:</span> clear and present,
                not faint or so loud it crackles.
              </li>
              <li>
                <span className="text-white/85">Background noise:</span> fans,
                typing, traffic, or room echo competing with your voice.
              </li>
              <li>
                <span className="text-white/85">Plosives &amp; sibilance:</span>{" "}
                harsh &ldquo;p&rdquo; pops or hissy &ldquo;s&rdquo; sounds that a
                small reposition usually fixes.
              </li>
            </ul>
          ),
        },
      ]}
      faqs={[
        {
          q: "Is my recording uploaded anywhere?",
          a: "No. The clip is captured with your browser's MediaRecorder and kept only in memory for playback. It is never uploaded, and it's discarded when you record again or reload the page.",
        },
        {
          q: "Can I download the recording?",
          a: "This tool is built for a quick listen-back. If you want to save the audio as a file, use our free online voice recorder, which adds pause/resume and a download button.",
        },
        {
          q: "Why can't I hear anything on playback?",
          a: "Check that your output device and volume are up, and that the input meter moved while recording. If the meter stayed flat, your mic input may be muted or the wrong device was selected.",
        },
        {
          q: "Which browsers work?",
          a: "Recording works in the latest Chrome, Edge, Firefox, and Safari, and the page must be served over HTTPS to access the microphone.",
        },
        {
          q: "Is it free?",
          a: "Yes — free, no account, and no limits on how many times you record and play back.",
        },
      ]}
      ctaHeading="Hear yourself, then type with your voice"
      ctaSubheading="Mic sounding good? OpenBroca turns that voice into text in any app — free, open source, on macOS, Windows, and Linux."
    />
  );
}
