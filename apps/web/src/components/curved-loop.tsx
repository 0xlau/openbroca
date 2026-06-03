"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

type CurvedLoopProps = {
  text: string;
  /** Pixels per frame (~60fps). */
  speed?: number;
  fontSize?: number;
  className?: string;
  textClassName?: string;
};

/**
 * Text flowing along a gentle SVG arc, looping forever — inspired by
 * reactbits.dev/text-animations/curved-loop. Auto-scrolls; the repeated string
 * is periodic so wrapping the offset by one text-unit is seamless.
 */
export function CurvedLoop({
  text,
  speed = 1.4,
  fontSize = 76,
  className = "",
  textClassName = "",
}: CurvedLoopProps) {
  const unitText = `${text} `; // trailing em-space as separator
  const rawId = useId().replace(/[^a-zA-Z0-9]/g, "");
  const pathId = `curved-loop-${rawId}`;
  const measureRef = useRef<SVGTextElement>(null);

  const [unit, setUnit] = useState(0);
  const [offset, setOffset] = useState(0);

  // Measure one text-unit (re-measure once fonts settle for a perfect seam).
  useEffect(() => {
    const measure = () => {
      const el = measureRef.current;
      if (el) setUnit(el.getComputedTextLength());
    };
    measure();
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    fonts?.ready.then(measure).catch(() => {});
  }, [unitText, fontSize]);

  const reps = unit ? Math.ceil((1800 + unit) / unit) + 2 : 2;
  const content = useMemo(() => unitText.repeat(reps), [unitText, reps]);

  useEffect(() => {
    if (!unit) return;
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    let raf = 0;
    let last = 0;
    const loop = (t: number) => {
      if (last) {
        const dt = t - last;
        setOffset((o) => {
          let n = o + (speed * dt) / 16;
          if (n >= unit) n -= unit;
          return n;
        });
      }
      last = t;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [unit, speed]);

  return (
    <svg
      className={className}
      // Width-driven: fills 100% of its container, height follows the viewBox
      // aspect ratio (no `meet` letterboxing), so the band spans full width.
      style={{ display: "block", width: "100%", height: "auto" }}
      viewBox="0 0 1440 220"
      role="img"
      aria-label={text}
    >
      <text
        ref={measureRef}
        xmlSpace="preserve"
        fontSize={fontSize}
        className={textClassName}
        style={{ visibility: "hidden", pointerEvents: "none" }}
      >
        {unitText}
      </text>
      <defs>
        {/* Downward "valley" arc: endpoints high, middle dips down. */}
        <path id={pathId} d="M-120,64 C 340,196 1100,196 1560,64" fill="none" />
      </defs>
      <text fontSize={fontSize} fill="currentColor" className={textClassName}>
        <textPath
          href={`#${pathId}`}
          startOffset={`${-offset}`}
          xmlSpace="preserve"
        >
          {content}
        </textPath>
      </text>
    </svg>
  );
}
