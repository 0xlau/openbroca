"use client";

import { useMemo, useState } from "react";

const PRESETS = [
  { label: "Slow", wpm: 100 },
  { label: "Average", wpm: 130 },
  { label: "Fast", wpm: 160 },
];

function fmt(minutes: number) {
  if (!isFinite(minutes) || minutes <= 0) return "0 sec";
  const totalSec = Math.round(minutes * 60);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m === 0) return `${s} sec`;
  return `${m} min ${String(s).padStart(2, "0")} sec`;
}

export function SpeechTimeCalculator() {
  const [text, setText] = useState("");
  const [wpm, setWpm] = useState(130);

  const words = useMemo(() => (text.trim().match(/\S+/g) || []).length, [text]);
  const chars = text.length;
  const duration = words / wpm;

  return (
    <div className="rounded-2xl border border-line bg-bg-elevated/40 p-6 md:p-8">
      <div className="space-y-6">
        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wider text-white/45">
            Your script or text
          </span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            placeholder="Paste the words you'll say out loud…"
            className="mt-2 w-full resize-y rounded-xl border border-line-strong bg-bg p-4 text-[15px] leading-relaxed text-white/90 outline-none placeholder:text-white/30 focus:border-brand/50"
          />
          <span className="mt-2 block text-xs text-white/40">
            {words.toLocaleString()} words · {chars.toLocaleString()} characters
          </span>
        </label>

        <div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-white/45">
              Speaking pace
            </span>
            <span className="text-sm tabular-nums text-white/70">{wpm} wpm</span>
          </div>
          <input
            type="range"
            min={80}
            max={200}
            step={5}
            value={wpm}
            onChange={(e) => setWpm(Number(e.target.value))}
            className="mt-3 w-full accent-brand"
          />
          <div className="mt-3 flex gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => setWpm(p.wpm)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  wpm === p.wpm
                    ? "border-brand/50 bg-brand/10 text-brand"
                    : "border-line-strong text-white/70 hover:text-white"
                }`}
              >
                {p.label} · {p.wpm}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-line-strong bg-bg p-5 text-center">
          <p className="text-xs uppercase tracking-wider text-white/40">
            Estimated speaking time
          </p>
          <p className="mt-1 font-display text-4xl tracking-tight text-white">
            {fmt(duration)}
          </p>
          <p className="mt-1 text-sm text-white/45">
            {words.toLocaleString()} words at {wpm} words per minute
          </p>
        </div>

        <div className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-line bg-line text-center">
          {PRESETS.map((p) => (
            <div key={p.label} className="bg-bg px-3 py-4">
              <p className="text-xs uppercase tracking-wider text-white/40">
                {p.label}
              </p>
              <p className="mt-1 text-sm font-semibold tabular-nums text-white/85">
                {fmt(words / p.wpm)}
              </p>
              <p className="text-[11px] text-white/35">{p.wpm} wpm</p>
            </div>
          ))}
        </div>
      </div>

      <p className="mt-6 text-xs text-white/40">
        Estimates are a guide — your real pace depends on pauses, emphasis, and
        delivery. Conversational speech averages roughly 130 words per minute.
      </p>
    </div>
  );
}
