"use client";

import type { CSSProperties, ReactNode } from "react";

type MarqueeProps<T> = {
  items: T[];
  render: (item: T, index: number) => ReactNode;
  /** Seconds for one full loop. */
  durationSec?: number;
  reverse?: boolean;
  /** Right gap applied to every item (Tailwind class). */
  itemClassName?: string;
  className?: string;
};

/**
 * Seamless, dependency-free CSS marquee. The track renders the items twice and
 * translates by exactly -50%; spacing is baked into each item (no flex `gap`)
 * so the wrap point is pixel-perfect. Pauses on hover, disabled for users who
 * prefer reduced motion.
 */
export function Marquee<T>({
  items,
  render,
  durationSec = 38,
  reverse = false,
  itemClassName = "pr-4",
  className = "",
}: MarqueeProps<T>) {
  const doubled = [...items, ...items];

  return (
    <div className={`group relative flex overflow-hidden mask-fade-x ${className}`}>
      <ul
        className="flex w-max items-stretch [animation:marquee-x_var(--marquee-duration)_linear_infinite] group-hover:[animation-play-state:paused] motion-reduce:[animation:none]"
        style={
          {
            "--marquee-duration": `${durationSec}s`,
            animationDirection: reverse ? "reverse" : "normal",
          } as CSSProperties
        }
      >
        {doubled.map((item, i) => (
          <li
            key={i}
            aria-hidden={i >= items.length}
            className={`shrink-0 ${itemClassName}`}
          >
            {render(item, i % items.length)}
          </li>
        ))}
      </ul>
    </div>
  );
}
