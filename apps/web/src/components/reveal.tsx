"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Fade + rise into view on scroll (one-shot). Content is visible by default;
 * JS "arms" the hidden state and plays a CSS animation when the element scrolls
 * into view. Above-the-fold elements play immediately on mount. If JS is absent
 * or reduced motion is preferred, content simply stays visible.
 */
export function Reveal({
  children,
  className = "",
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [armed, setArmed] = useState(false);
  const [play, setPlay] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reduce = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduce || !("IntersectionObserver" in window)) {
      return; // stays visible
    }

    // Only animate when the tab is actually being viewed. Background tabs and
    // headless/crawler renders (where CSS animations are frozen) keep content
    // visible instead of stuck at the animation's hidden first frame.
    if (document.visibilityState === "hidden") {
      return;
    }

    setArmed(true);

    // Already on screen → play immediately. The `[data-play]` animation starts
    // from its `from` (opacity 0) keyframe, so there is no flash without a
    // separate "paint hidden first" frame (and no reliance on rAF, which is
    // paused in background/headless tabs).
    if (el.getBoundingClientRect().top < window.innerHeight) {
      setPlay(true);
      return;
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setPlay(true);
          io.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      data-armed={armed ? "" : undefined}
      data-play={play ? "" : undefined}
      style={delay ? { animationDelay: `${delay}ms` } : undefined}
      className={`reveal ${className}`}
    >
      {children}
    </div>
  );
}
