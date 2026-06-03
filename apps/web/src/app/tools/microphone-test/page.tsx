import type { Metadata } from "next";
import { ogImage, site } from "@/lib/site";
import { ToolPage } from "@/components/tool-page";
import { MicrophoneTest } from "@/components/tools/microphone-test";

const url = `${site.url}/tools/microphone-test`;
const title = "Microphone Test — Check if your mic works online (free)";
const description =
  "Free online microphone test. Confirm your mic works in seconds with a live input-level meter, pick the right input device, and fix common problems — all in your browser, nothing uploaded.";

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

export default function MicrophoneTestPage() {
  return (
    <ToolPage
      slug="microphone-test"
      eyebrow="Microphone test"
      title="Test your microphone online"
      schemaName="Microphone Test"
      schemaDescription={description}
      lead="A free, in-browser microphone test. Press start, allow access, and speak — if the level meter moves, your mic is working. Nothing is recorded or uploaded."
      tool={<MicrophoneTest />}
      sections={[
        {
          heading: "How to test your microphone",
          body: (
            <ol className="list-decimal space-y-2 pl-5 marker:text-white/40">
              <li>
                Press <span className="text-white/85">Start microphone test</span>{" "}
                above.
              </li>
              <li>
                When the browser asks, choose <em>Allow</em> so the page can read
                your microphone.
              </li>
              <li>
                Speak at a normal volume and watch the level meter. It should
                rise and fall with your voice.
              </li>
              <li>
                If the bar stays flat, open the <em>Input device</em> dropdown
                and choose a different microphone, then try again.
              </li>
            </ol>
          ),
        },
        {
          heading: "Why isn't my microphone working?",
          body: (
            <>
              <p>
                If the meter doesn&apos;t move when you talk, the most common
                causes are:
              </p>
              <ul className="list-disc space-y-2 pl-5 marker:text-white/40">
                <li>
                  <span className="text-white/85">Permission blocked.</span> The
                  site needs microphone access — check the small icon in your
                  browser&apos;s address bar and set this site to{" "}
                  <em>Allow</em>.
                </li>
                <li>
                  <span className="text-white/85">Wrong input selected.</span>{" "}
                  Headsets, webcams, and built-in mics all show up separately.
                  Pick the right one in the device dropdown.
                </li>
                <li>
                  <span className="text-white/85">Muted or low input.</span> Your
                  operating system&apos;s sound settings may have the input
                  muted or the input level near zero.
                </li>
                <li>
                  <span className="text-white/85">In use elsewhere.</span> Another
                  app may be holding the microphone exclusively — close it and
                  reload.
                </li>
                <li>
                  <span className="text-white/85">Hardware.</span> Check the cable,
                  USB port, or mute switch on the mic or headset.
                </li>
              </ul>
            </>
          ),
        },
        {
          heading: "Is it really private?",
          body: (
            <p>
              Yes. This test uses your browser&apos;s built-in{" "}
              <code className="rounded bg-white/5 px-1.5 py-0.5 text-[0.9em] text-white/80">
                getUserMedia
              </code>{" "}
              API to read the live input level only. No audio is recorded,
              stored, or sent anywhere — the moment you stop the test or close the
              tab, it&apos;s gone. The same privacy-first philosophy drives{" "}
              {site.name}, which can run speech recognition fully on-device.
            </p>
          ),
        },
      ]}
      faqs={[
        {
          q: "Is this microphone test free?",
          a: "Yes. It's completely free, needs no account or sign-up, and works in any modern browser over HTTPS.",
        },
        {
          q: "Does it record or upload my audio?",
          a: "No. The test reads only the live input level in your browser to move the meter. It never records, stores, or uploads any audio.",
        },
        {
          q: "Why does my browser ask for microphone permission?",
          a: "Browsers require explicit permission before any site can access your microphone. Choose Allow to run the test; you can revoke it at any time from the address-bar permission menu.",
        },
        {
          q: "My mic works here but not in another app — why?",
          a: "Each app manages its own microphone permission and selected input device. If the test works here, the hardware is fine; check that app's audio settings and permissions.",
        },
        {
          q: "How do I choose a different microphone?",
          a: "After you start the test and allow access, use the Input device dropdown to switch between any connected microphones, headsets, or webcams.",
        },
        {
          q: "Which browsers are supported?",
          a: "The latest versions of Chrome, Edge, Firefox, and Safari all work. The page must be served over HTTPS for microphone access to be allowed.",
        },
      ]}
      ctaHeading="Make your voice an input everywhere"
      ctaSubheading="Mic working? Take it further. OpenBroca turns your speech into text in any app on macOS, Windows, and Linux — free and open source."
    />
  );
}
