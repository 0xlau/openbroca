"use client";

/**
 * Horizontal input-level meter. `value` is a normalized 0–1 loudness reading.
 * Purely presentational — the parent owns the AudioContext/analyser loop.
 */
export function LevelMeter({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;

  return (
    <div className="w-full">
      <div
        role="meter"
        aria-label="Microphone input level"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        className="h-4 w-full overflow-hidden rounded-full border border-line bg-bg"
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-brand-soft to-brand transition-[width] duration-75 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] uppercase tracking-wider text-white/35">
        <span>Quiet</span>
        <span>Loud</span>
      </div>
    </div>
  );
}
