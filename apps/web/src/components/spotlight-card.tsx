"use client";

import { useRef, type ReactNode, type MouseEvent } from "react";

/**
 * Card with a cursor-following radial spotlight (reactbits.dev SpotlightCard).
 * Pure CSS variables — no re-renders on mouse move.
 */
export function SpotlightCard({
  children,
  className = "",
  spotlightColor = "rgba(255, 68, 5, 0.14)",
}: {
  children: ReactNode;
  className?: string;
  spotlightColor?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const onMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--spot-x", `${e.clientX - rect.left}px`);
    el.style.setProperty("--spot-y", `${e.clientY - rect.top}px`);
  };

  return (
    <div
      ref={ref}
      onMouseMove={onMouseMove}
      className={`group/spot relative overflow-hidden ${className}`}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover/spot:opacity-100"
        style={{
          background: `radial-gradient(260px circle at var(--spot-x, 50%) var(--spot-y, 0%), ${spotlightColor}, transparent 70%)`,
        }}
      />
      {children}
    </div>
  );
}
