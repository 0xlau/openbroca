export type CompareRow = {
  dimension: string;
  openbroca: string;
  competitor: string;
  /** Marks a row where OpenBroca has a clear, defensible advantage. */
  edge?: boolean;
};

export type Comparison = {
  slug: string;
  /** Competitor display name. */
  name: string;
  /** Their public positioning, paraphrased fairly from their own site. */
  positioning: string;
  metaTitle: string;
  metaDescription: string;
  h1: string;
  /** Lead-in paragraphs — unique per competitor. */
  intro: string[];
  /** Reasons to choose OpenBroca, framed for this specific competitor. */
  reasons: { title: string; body: string }[];
  rows: CompareRow[];
  /** Honest note on when the other tool is the better pick. */
  honestTake: string;
};

/**
 * Comparison details reflect each product's public website as of mid-2026 and
 * are paraphrased in good faith; commercial products change often, so always
 * confirm specifics on the vendor's own site. OpenBroca's own column is
 * verifiable directly from its open-source code.
 */
export const COMPARE_DISCLAIMER =
  "Details about other tools are summarized from their public websites as of June 2026 and may change — please verify on their sites. Everything claimed about OpenBroca is verifiable in its open-source code.";

export const comparisons: Comparison[] = [
  {
    slug: "wispr-flow",
    name: "Wispr Flow",
    positioning:
      "Wispr Flow is a polished commercial voice-to-text app that turns speech into clean writing across your apps, with AI auto-edits and a personal dictionary.",
    metaTitle: "OpenBroca vs Wispr Flow — open-source voice dictation",
    metaDescription:
      "OpenBroca vs Wispr Flow: a free, open-source, local-first voice dictation alternative. Compare licensing, pricing, on-device models, provider choice, and platforms.",
    h1: "OpenBroca vs Wispr Flow",
    intro: [
      "Wispr Flow is one of the most refined commercial dictation apps available — fast, well-designed, and tuned to drop polished text into whatever app you are working in. If you want a managed, batteries-included experience and don't mind a subscription, it's an excellent product.",
      "OpenBroca takes a different stance. It is free, open source under the MIT license, and built so that you choose where your audio and text are processed — cloud providers for speed, or fully local models for privacy. If openness, price, and control matter more to you than a fully managed stack, OpenBroca is the alternative worth trying.",
    ],
    reasons: [
      {
        title: "It's free and open source",
        body: "OpenBroca is MIT-licensed and developed in the open. There is no subscription, and you can read, audit, fork, or extend every line — including how recognition and rewriting actually work.",
      },
      {
        title: "Your audio can stay on your machine",
        body: "Run Sherpa-ONNX speech recognition entirely on-device so dictation never touches a server. Wispr Flow's experience is built around its cloud stack; with OpenBroca, going local is a setting, not a special tier.",
      },
      {
        title: "Bring your own providers",
        body: "Plug in your own API keys across 16+ language-model providers and swap engines per task. You're never tied to one vendor's models, pricing, or roadmap.",
      },
      {
        title: "Linux is a first-class citizen",
        body: "OpenBroca ships native desktop builds for macOS, Windows, and Linux — so the same dictation workflow follows you onto a Linux machine.",
      },
    ],
    rows: [
      {
        dimension: "License",
        openbroca: "Open source (MIT) — read & fork the code",
        competitor: "Proprietary, closed source",
        edge: true,
      },
      {
        dimension: "Price",
        openbroca: "Free, forever",
        competitor: "Free tier + paid Pro subscription",
        edge: true,
      },
      {
        dimension: "On-device / offline models",
        openbroca: "Yes — fully local ASR (Sherpa-ONNX)",
        competitor: "Cloud-based processing",
        edge: true,
      },
      {
        dimension: "Provider choice",
        openbroca: "Bring your own — 2 ASR engines, 16+ LLMs, swappable",
        competitor: "Single managed AI stack",
        edge: true,
      },
      {
        dimension: "Desktop platforms",
        openbroca: "macOS, Windows, Linux",
        competitor: "macOS & Windows",
      },
      {
        dimension: "Credentials & data",
        openbroca: "Your own keys in OS-backed secure storage",
        competitor: "Managed service account",
      },
      {
        dimension: "Dictate into any app",
        openbroca: "Yes — system-wide input",
        competitor: "Yes",
      },
      {
        dimension: "AI rewrite / edit",
        openbroca: "Yes — via your chosen LLM",
        competitor: "Yes — built-in auto edits",
      },
    ],
    honestTake:
      "If you want the most polished, hands-off experience and a refined mobile companion, Wispr Flow is a strong, well-funded product and the subscription buys real convenience. OpenBroca is for people who would rather own the stack: free, open, local-capable, and never locked to one vendor.",
  },
  {
    slug: "typeless",
    name: "Typeless",
    positioning:
      "Typeless markets itself as intelligent AI voice dictation that turns natural speech into polished messages, with translation, 100+ languages, and a privacy-forward stance.",
    metaTitle: "OpenBroca vs Typeless — open-source dictation alternative",
    metaDescription:
      "OpenBroca vs Typeless: a free, open-source, local-first voice dictation alternative. Compare licensing, price, on-device privacy, provider choice, and platforms.",
    h1: "OpenBroca vs Typeless",
    intro: [
      "Typeless positions itself as dictation that's genuinely intelligent — cleaning up filler, formatting on the fly, translating, and adapting to how you write, across a wide set of languages and devices. It's a capable commercial product with a strong privacy message.",
      "OpenBroca shares the goal of effortless, intelligent dictation but is open source and free, and it lets you prove the privacy story rather than take it on trust. Choose cloud models for raw speed, or run recognition fully on-device so your audio never leaves your computer.",
    ],
    reasons: [
      {
        title: "Verifiable privacy, not just a promise",
        body: "Privacy claims are easy to make and hard to check. With OpenBroca you can run local models so audio never leaves your machine, store credentials in OS-backed secure storage, and inspect the source to confirm exactly what happens to your data.",
      },
      {
        title: "Free and MIT-licensed",
        body: "No subscription and no paywalled tiers. OpenBroca is permissively licensed, so you can use it, fork it, and ship it however you like.",
      },
      {
        title: "No vendor lock-in",
        body: "Swap between 16+ language-model providers and two speech engines through open interfaces. Your workflow isn't pinned to one company's models or pricing.",
      },
      {
        title: "Composable voice workflows",
        body: "Chain recognition and language steps — transcribe, translate, summarize, rewrite — into flows that match how you actually work, then trigger them anywhere.",
      },
    ],
    rows: [
      {
        dimension: "License",
        openbroca: "Open source (MIT)",
        competitor: "Proprietary, closed source",
        edge: true,
      },
      {
        dimension: "Price",
        openbroca: "Free, forever",
        competitor: "Paid subscription",
        edge: true,
      },
      {
        dimension: "On-device / offline models",
        openbroca: "Yes — fully local ASR (Sherpa-ONNX)",
        competitor: "Cloud-based, privacy-forward",
        edge: true,
      },
      {
        dimension: "Provider choice",
        openbroca: "Bring your own — 2 ASR engines, 16+ LLMs",
        competitor: "Single managed AI stack",
        edge: true,
      },
      {
        dimension: "Translation & rewrite",
        openbroca: "Yes — via your chosen LLM",
        competitor: "Yes — built-in",
      },
      {
        dimension: "Desktop platforms",
        openbroca: "macOS, Windows, Linux",
        competitor: "macOS & Windows (plus mobile)",
      },
      {
        dimension: "Credentials & data",
        openbroca: "Your own keys, local option",
        competitor: "Managed service account",
      },
    ],
    honestTake:
      "Typeless is a slick, multi-language product with mobile apps and a clear privacy commitment, and that polish is worth paying for if you want a turnkey tool. OpenBroca is the better fit when you'd rather verify privacy in code, avoid a subscription, and keep full control over which models run.",
  },
  {
    slug: "monologue",
    name: "Monologue",
    positioning:
      "Monologue is an Apple-ecosystem-focused dictation app — effortless voice-to-text that's context-aware across apps, supports 100+ languages, and includes an iOS keyboard.",
    metaTitle: "OpenBroca vs Monologue — open-source dictation alternative",
    metaDescription:
      "OpenBroca vs Monologue: a free, open-source, cross-platform voice dictation alternative with local models. Compare licensing, price, platforms, and provider choice.",
    h1: "OpenBroca vs Monologue",
    intro: [
      "Monologue is a clean, context-aware dictation app with a strong presence on Mac and iOS, multi-language support, and an iOS keyboard for dictating on the go. If you live inside the Apple ecosystem, it's a thoughtful, well-integrated choice.",
      "OpenBroca is aimed at people who want the same effortless dictation but across every desktop — including Windows and Linux — and who prefer open source and free pricing over a subscription. You bring your own models and keys, and you can keep everything local if you choose.",
    ],
    reasons: [
      {
        title: "True cross-platform desktop",
        body: "Monologue centers on Mac and iOS. OpenBroca ships native desktop builds for macOS, Windows, and Linux, so the same dictation workflow works no matter which computer you sit down at.",
      },
      {
        title: "Open source and free",
        body: "No subscription and no bundle to sign up for. OpenBroca is MIT-licensed and built in public, so you can audit, fork, and extend it freely.",
      },
      {
        title: "Choose cloud or fully local",
        body: "Run Deepgram in the cloud for speed or Sherpa-ONNX entirely on-device for privacy. You decide, per task, where your audio goes.",
      },
      {
        title: "Bring your own providers",
        body: "Mix and match 16+ language models and two speech engines through open interfaces — nothing is hard-wired to one vendor.",
      },
    ],
    rows: [
      {
        dimension: "License",
        openbroca: "Open source (MIT)",
        competitor: "Proprietary, closed source",
        edge: true,
      },
      {
        dimension: "Price",
        openbroca: "Free, forever",
        competitor: "Paid subscription / bundle",
        edge: true,
      },
      {
        dimension: "Desktop platforms",
        openbroca: "macOS, Windows, Linux",
        competitor: "macOS (plus iOS)",
        edge: true,
      },
      {
        dimension: "On-device / offline models",
        openbroca: "Yes — fully local ASR (Sherpa-ONNX)",
        competitor: "Varies",
        edge: true,
      },
      {
        dimension: "Provider choice",
        openbroca: "Bring your own — 2 ASR engines, 16+ LLMs",
        competitor: "Single managed AI stack",
        edge: true,
      },
      {
        dimension: "Mobile / iOS keyboard",
        openbroca: "Desktop-focused",
        competitor: "Yes — iOS app & keyboard",
      },
      {
        dimension: "Context-aware formatting",
        openbroca: "Yes — via workflows & LLMs",
        competitor: "Yes — built-in",
      },
    ],
    honestTake:
      "If you're all-in on Mac and iPhone and want a tightly integrated iOS keyboard, Monologue's Apple-ecosystem focus is a genuine strength. OpenBroca is the better pick when you need Windows or Linux too, prefer open source, and want to avoid a subscription.",
  },
];

export function getComparison(slug: string): Comparison | undefined {
  return comparisons.find((c) => c.slug === slug);
}
