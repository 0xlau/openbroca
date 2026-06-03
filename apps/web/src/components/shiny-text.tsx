"use client";

/**
 * Subtle sweeping shine across text (reactbits.dev ShinyText).
 */
export function ShinyText({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  return (
    <span
      className={`bg-[length:200%_100%] bg-clip-text text-transparent [animation:shine_4s_linear_infinite] motion-reduce:[animation:none] ${className}`}
      style={{
        backgroundImage:
          "linear-gradient(110deg, rgba(255,255,255,0.55) 35%, rgba(255,255,255,1) 50%, rgba(255,255,255,0.55) 65%)",
      }}
    >
      {text}
    </span>
  );
}
