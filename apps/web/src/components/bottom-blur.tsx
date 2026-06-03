import type { CSSProperties } from "react";

// Progressive ("layered") blur fixed to the bottom of the viewport. Each layer
// blurs a little more and is masked to a band a little lower, so the blur ramps
// up smoothly toward the bottom edge — a premium frosted-glass fade.
const layers: { blur: number; mask: string }[] = [
  { blur: 0.5, mask: "transparent 0%, black 15%, black 35%, transparent 50%" },
  { blur: 1, mask: "transparent 15%, black 30%, black 50%, transparent 65%" },
  { blur: 2, mask: "transparent 30%, black 45%, black 65%, transparent 80%" },
  { blur: 4, mask: "transparent 45%, black 60%, black 80%, transparent 95%" },
  { blur: 8, mask: "transparent 60%, black 75%, black 100%" },
  { blur: 16, mask: "transparent 75%, black 92%, black 100%" },
];

export function BottomBlur() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 h-28 md:h-32"
    >
      {layers.map((l, i) => {
        const mask = `linear-gradient(to bottom, ${l.mask})`;
        const style: CSSProperties = {
          backdropFilter: `blur(${l.blur}px)`,
          WebkitBackdropFilter: `blur(${l.blur}px)`,
          maskImage: mask,
          WebkitMaskImage: mask,
        };
        return <div key={i} className="absolute inset-0" style={style} />;
      })}
      {/* subtle darkening for depth */}
      <div className="absolute inset-0 bg-gradient-to-t from-bg/35 to-transparent" />
    </div>
  );
}
