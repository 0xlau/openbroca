import {
  AudioLines,
  Cpu,
  Wand2,
  Shuffle,
  Workflow,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { Reveal } from "../reveal";
import { SpotlightCard } from "../spotlight-card";

type Feature = {
  icon: LucideIcon;
  title: string;
  description: string;
};

const features: Feature[] = [
  {
    icon: AudioLines,
    title: "Dictate into any app",
    description:
      "Speak and your words land in whatever window is focused — editors, browsers, chat, the terminal. Voice as a real, system-wide input layer.",
  },
  {
    icon: Cpu,
    title: "Cloud or local ASR",
    description:
      "Run Deepgram in the cloud for speed, or Sherpa-ONNX entirely on-device for privacy. You decide where your audio goes.",
  },
  {
    icon: Wand2,
    title: "Rewrite with LLMs",
    description:
      "Polish, translate, summarize, and transform what you said on the fly with your choice of 16+ language-model providers.",
  },
  {
    icon: Shuffle,
    title: "No vendor lock-in",
    description:
      "Swap providers and models freely through open interfaces. Never locked to one vendor, one model, or one workflow.",
  },
  {
    icon: Workflow,
    title: "Custom voice workflows",
    description:
      "Compose recognition and language steps into flows that match how you actually work, then trigger them anywhere.",
  },
  {
    icon: ShieldCheck,
    title: "Private by design",
    description:
      "Credentials live in OS-backed secure storage, and local models keep your audio on your machine. Your keys, your data.",
  },
];

export function Features() {
  return (
    <section id="features" className="scroll-mt-20 py-24 md:py-32">
      <div className="container-px">
        <Reveal className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-widest text-brand">
            Features
          </p>
          <h2 className="mt-3 font-display text-4xl tracking-tight text-white md:text-5xl">
            Your voice, as a first-class input.
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-white/60">
            Everything you need to talk to your computer the way you think —
            open, extensible, and built for daily use.
          </p>
        </Reveal>

        <Reveal delay={120} className="mt-14">
          <div className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
            {features.map(({ icon: Icon, title, description }) => (
              <SpotlightCard key={title} className="bg-bg">
                <div className="h-full p-7 transition-colors duration-300 hover:bg-bg-elevated/40">
                  <div className="inline-flex size-11 items-center justify-center rounded-xl border border-line-strong bg-brand/10 text-brand">
                    <Icon className="size-5.5" strokeWidth={2} />
                  </div>
                  <h3 className="mt-5 text-lg font-semibold text-white">
                    {title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-white/55">
                    {description}
                  </p>
                </div>
              </SpotlightCard>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
