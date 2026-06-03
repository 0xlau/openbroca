import type { Metadata } from "next";
import { ogImage, site } from "@/lib/site";
import { ToolPage } from "@/components/tool-page";
import { VoiceRecorder } from "@/components/tools/voice-recorder";

const url = `${site.url}/tools/voice-recorder`;
const title = "Online Voice Recorder — record & download audio (free)";
const description =
  "Free online voice recorder. Record audio in your browser with pause and resume, then download the file. No install, no account, and nothing is uploaded — recording stays on your device.";

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

export default function VoiceRecorderPage() {
  return (
    <ToolPage
      slug="voice-recorder"
      eyebrow="Online voice recorder"
      title="Free online voice recorder"
      schemaName="Online Voice Recorder"
      schemaDescription={description}
      lead="Record audio right in your browser — pause and resume as you go, play it back, and download the file. No install, no sign-up, and nothing leaves your device."
      tool={<VoiceRecorder />}
      sections={[
        {
          heading: "Record, pause, download",
          body: (
            <p>
              Press record and the tool captures audio from your microphone using
              the browser&apos;s built-in MediaRecorder. Pause when you need to
              think and resume without starting over. When you stop, you get an
              inline player to review the take and a one-click download so you can
              save it as an audio file and use it anywhere — voice notes, memos,
              audition clips, language practice, or a quick message.
            </p>
          ),
        },
        {
          heading: "Good for",
          body: (
            <ul className="list-disc space-y-2 pl-5 marker:text-white/40">
              <li>Quick voice memos and reminders</li>
              <li>Practising a talk, pitch, or pronunciation</li>
              <li>Recording feedback or audio messages to send</li>
              <li>Capturing an idea before it slips away</li>
            </ul>
          ),
        },
        {
          heading: "Private and offline-friendly",
          body: (
            <p>
              The recording is created and stored entirely in your browser. It is
              never streamed or uploaded to a server, and the download is
              generated locally from the audio in memory. That privacy model is
              the whole point of {site.name}: your voice should stay on hardware
              you control. For dictation that types into any app — with on-device
              models when you want them — see{" "}
              <a
                href="/offline-speech-to-text"
                className="text-white/80 underline-offset-4 hover:text-white hover:underline"
              >
                offline speech-to-text
              </a>
              .
            </p>
          ),
        },
      ]}
      faqs={[
        {
          q: "Is this voice recorder free?",
          a: "Yes. Recording, playback, and download are all free, with no account and no time limit.",
        },
        {
          q: "What audio format does it download?",
          a: "It saves in the format your browser records natively — usually WebM (Opus), and M4A/MP4 in some browsers like Safari. The download's file extension matches automatically.",
        },
        {
          q: "Is my audio uploaded to a server?",
          a: "No. The entire recording is captured and saved in your browser. Nothing is sent to us or any third party.",
        },
        {
          q: "Can I pause and resume a recording?",
          a: "Yes. Use Pause to stop temporarily and Resume to continue the same recording; the timer reflects only the recorded time.",
        },
        {
          q: "Where is my recording after I reload?",
          a: "It's gone. The audio lives only in the page's memory, so reloading or closing the tab clears it. Download it first if you want to keep it.",
        },
        {
          q: "Which browsers are supported?",
          a: "The latest Chrome, Edge, Firefox, and Safari support in-browser recording. The page must be served over HTTPS to use the microphone.",
        },
      ]}
      ctaHeading="From recordings to real dictation"
      ctaSubheading="Love recording in the browser? OpenBroca turns speech into text in any app on macOS, Windows, and Linux — free and open source."
    />
  );
}
