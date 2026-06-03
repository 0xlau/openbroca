import type { Metadata, Viewport } from "next";
import { Inter, Instrument_Serif } from "next/font/google";
import { GoogleAnalytics } from "@next/third-parties/google";
import { analytics, site } from "@/lib/site";
import { BottomBlur } from "@/components/bottom-blur";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-instrument-serif",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: site.seoTitle,
    template: `%s — ${site.name}`,
  },
  description: site.seoDescription,
  applicationName: site.name,
  keywords: [
    "OpenBroca",
    "voice dictation",
    "voice to text",
    "speech to text",
    "dictation app",
    "voice typing",
    "dictate into any app",
    "open source dictation",
    "local speech to text",
    "offline dictation",
    "AI voice dictation",
    "speech recognition",
    "ASR",
    "LLM",
    "Deepgram",
    "Sherpa-ONNX",
    "Whisper",
    "macOS",
    "Windows",
    "Linux",
  ],
  authors: [{ name: site.author.name, url: site.author.url }],
  creator: site.author.name,
  openGraph: {
    type: "website",
    url: site.url,
    title: site.seoTitle,
    description: site.seoDescription,
    siteName: site.name,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: site.seoTitle,
    description: site.seoDescription,
  },
  alternates: {
    canonical: site.url,
  },
  verification: { google: analytics.googleSiteVerification },
};

export const viewport: Viewport = {
  themeColor: "#08080a",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${instrumentSerif.variable}`}
    >
      <body className="min-h-screen antialiased">
        {children}
        <BottomBlur />
        {analytics.gaId ? <GoogleAnalytics gaId={analytics.gaId} /> : null}
      </body>
    </html>
  );
}
