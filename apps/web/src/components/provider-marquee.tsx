"use client";

import { Marquee } from "./marquee";
import { providers, type Provider } from "./provider-icons";

function ProviderChip({ name, kind, local, Icon }: Provider) {
  return (
    <div className="flex items-center gap-3 rounded-full border border-line bg-bg-elevated/60 px-5 py-3.5 backdrop-blur transition duration-300 hover:border-brand/50 hover:bg-bg-elevated hover:shadow-[0_10px_40px_-16px_rgba(255,68,5,0.55)] select-none">
      <Icon
        size={22}
        className="shrink-0 text-white/85 transition-colors duration-300 group-hover:text-white"
      />
      <span className="whitespace-nowrap text-sm font-medium text-white/85">
        {name}
      </span>
      <span className="rounded-full border border-line-strong px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white/45">
        {local ? "Local" : kind === "asr" ? "ASR" : "LLM"}
      </span>
    </div>
  );
}

export function ProviderMarquee() {
  // Interleave so each row carries a recognizable mix of brands.
  const rowA = providers.filter((_, i) => i % 2 === 0);
  const rowB = providers.filter((_, i) => i % 2 === 1);

  return (
    <div className="flex flex-col gap-4">
      <Marquee
        items={rowA}
        durationSec={42}
        render={(p) => <ProviderChip {...p} />}
      />
      <Marquee
        items={rowB}
        durationSec={50}
        reverse
        render={(p) => <ProviderChip {...p} />}
      />
    </div>
  );
}
