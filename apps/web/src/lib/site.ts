export const site = {
  name: "OpenBroca",
  tagline: "An open-source voice interface for the AI era.",
  description:
    "OpenBroca turns speech into text, intent into action, and your voice into a system-wide input layer. Dictate into any app, with the cloud or local models you choose.",
  shortDescription: "Just speak your thoughts.",
  // Search-optimized title/description used for <title>, OpenGraph, and Twitter.
  // These lead with the high-intent terms people actually search for
  // (voice dictation, speech-to-text, dictate into any app) while the
  // brand `tagline`/`description` above stay for on-page copy.
  seoTitle: "OpenBroca — Open-source voice dictation for any app",
  seoDescription:
    "Free, open-source voice dictation. Turn speech into text in any app on macOS, Windows & Linux — with the cloud or fully local AI models you choose. No vendor lock-in.",
  version: "0.2.1",
  url: "https://openbroca.com",
  repo: "https://github.com/0xlau/openbroca",
  releases: "https://github.com/0xlau/openbroca/releases/latest",
  issues: "https://github.com/0xlau/openbroca/issues",
  license: "https://github.com/0xlau/openbroca/blob/main/LICENSE",
  author: {
    name: "Timothy Lau",
    url: "https://github.com/0xlau",
  },
} as const;

/**
 * Shared social-share image. The homepage gets this automatically via the
 * `opengraph-image.tsx` file convention; nested routes must reference it
 * explicitly (the file convention does not cascade to child segments).
 */
export const ogImage = {
  url: "/opengraph-image",
  width: 1200,
  height: 630,
  alt: `${site.name} — open-source voice dictation`,
} as const;

export type NavLink = { label: string; href: string };

// Anchors are prefixed with `/` so they resolve to the homepage section from
// any route (e.g. a /vs/... comparison page), not a missing in-page anchor.
export const navLinks: NavLink[] = [
  { label: "Features", href: "/#features" },
  { label: "Providers", href: "/#providers" },
  { label: "Download", href: "/#download" },
  { label: "Tools", href: "/tools" },
  { label: "GitHub", href: site.repo },
];

/** Keyword landing pages (used for footer links + sitemap). */
export const guidePages: NavLink[] = [
  { label: "Open-source dictation", href: "/open-source-dictation" },
  { label: "Offline speech-to-text", href: "/offline-speech-to-text" },
];

/** Competitor comparison pages (used for footer links + sitemap). */
export const comparePages: NavLink[] = [
  { label: "vs Wispr Flow", href: "/vs/wispr-flow" },
  { label: "vs Typeless", href: "/vs/typeless" },
  { label: "vs Monologue", href: "/vs/monologue" },
];

/**
 * Free, browser-based utility tools. These are SEO "linkable assets" — pages
 * people search for and link to (mic test, voice recorder, …) that also serve
 * as live, no-install demos of what OpenBroca does. Used for the /tools hub,
 * footer links, related-tool cross-links, and the sitemap.
 */
export const toolPages: NavLink[] = [
  { label: "Microphone test", href: "/tools/microphone-test" },
  { label: "Mic test — record & playback", href: "/tools/mic-test-recording" },
  { label: "Online voice recorder", href: "/tools/voice-recorder" },
  { label: "Speech to text", href: "/tools/speech-to-text" },
  { label: "Text to speech", href: "/tools/text-to-speech" },
];

/**
 * Analytics / Search Console config, sourced from environment variables so no
 * IDs are committed (this repo is public — a hardcoded GA id would make forks
 * report into our property). Set these in Vercel → Settings → Environment
 * Variables (Production + Preview). Leaving them unset is safe: nothing renders.
 */
export const analytics = {
  /** GA4 Measurement ID, e.g. "G-XXXXXXXXXX". Public by nature. */
  gaId: process.env.NEXT_PUBLIC_GA_ID,
  /** GSC "HTML tag" verification token (the `content` value). Server-only. */
  googleSiteVerification: process.env.SITE_GOOGLE_SITE_VERIFICATION,
} as const;
