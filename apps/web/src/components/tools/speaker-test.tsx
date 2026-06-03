"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Volume2, ChevronLeft, ChevronRight, Play, Square } from "lucide-react";

type Channel = "left" | "both" | "right" | "sweep" | null;

export function SpeakerTest() {
  const [volume, setVolume] = useState(0.2);
  const [freq, setFreq] = useState(440);
  const [active, setActive] = useState<Channel>(null);

  const ctxRef = useRef<AudioContext | null>(null);
  const oscRef = useRef<OscillatorNode | null>(null);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const volRef = useRef(volume);
  volRef.current = volume;

  const ensureCtx = useCallback(() => {
    if (!ctxRef.current) {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      ctxRef.current = new Ctx();
    }
    if (ctxRef.current.state === "suspended") void ctxRef.current.resume();
    return ctxRef.current;
  }, []);

  const stop = useCallback(() => {
    if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    stopTimerRef.current = null;
    const osc = oscRef.current;
    if (osc) {
      try {
        osc.stop();
      } catch {
        /* already stopped */
      }
      oscRef.current = null;
    }
    setActive(null);
  }, []);

  useEffect(
    () => () => {
      stop();
      void ctxRef.current?.close().catch(() => {});
      ctxRef.current = null;
    },
    [stop],
  );

  const playTone = useCallback(
    (pan: number, channel: Channel, durationMs = 1600) => {
      stop();
      const ctx = ensureCtx();
      const now = ctx.currentTime;
      const dur = durationMs / 1000;

      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now);

      const gain = ctx.createGain();
      const v = volRef.current;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(v, now + 0.02);
      gain.gain.setValueAtTime(v, now + dur - 0.05);
      gain.gain.linearRampToValueAtTime(0, now + dur);

      const panner = ctx.createStereoPanner();
      panner.pan.setValueAtTime(pan, now);

      osc.connect(gain).connect(panner).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + dur);
      oscRef.current = osc;
      setActive(channel);

      osc.onended = () => {
        if (oscRef.current === osc) {
          oscRef.current = null;
          setActive(null);
        }
      };
      stopTimerRef.current = setTimeout(() => setActive(null), durationMs);
    },
    [ensureCtx, freq, stop],
  );

  const playSweep = useCallback(() => {
    stop();
    const ctx = ensureCtx();
    const now = ctx.currentTime;
    const dur = 4;

    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(60, now);
    osc.frequency.exponentialRampToValueAtTime(12000, now + dur);

    const gain = ctx.createGain();
    const v = volRef.current;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(v, now + 0.05);
    gain.gain.setValueAtTime(v, now + dur - 0.1);
    gain.gain.linearRampToValueAtTime(0, now + dur);

    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + dur);
    oscRef.current = osc;
    setActive("sweep");
    osc.onended = () => {
      if (oscRef.current === osc) {
        oscRef.current = null;
        setActive(null);
      }
    };
    stopTimerRef.current = setTimeout(() => setActive(null), dur * 1000);
  }, [ensureCtx, stop]);

  const chanBtn =
    "flex flex-1 flex-col items-center justify-center gap-1.5 rounded-xl border px-4 py-5 text-sm font-semibold transition";

  return (
    <div className="rounded-2xl border border-line bg-bg-elevated/40 p-6 md:p-8">
      <div className="space-y-6">
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200/90">
          Turn your volume down before you start, then raise it gradually. Test
          tones can be loud on headphones.
        </div>

        <div>
          <span className="text-xs font-medium uppercase tracking-wider text-white/45">
            Channel test
          </span>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => playTone(-1, "left")}
              className={`${chanBtn} ${
                active === "left"
                  ? "border-brand/50 bg-brand/10 text-brand"
                  : "border-line-strong text-white/80 hover:border-white/25"
              }`}
            >
              <ChevronLeft className="size-5" />
              Left
            </button>
            <button
              type="button"
              onClick={() => playTone(0, "both")}
              className={`${chanBtn} ${
                active === "both"
                  ? "border-brand/50 bg-brand/10 text-brand"
                  : "border-line-strong text-white/80 hover:border-white/25"
              }`}
            >
              <Volume2 className="size-5" />
              Both
            </button>
            <button
              type="button"
              onClick={() => playTone(1, "right")}
              className={`${chanBtn} ${
                active === "right"
                  ? "border-brand/50 bg-brand/10 text-brand"
                  : "border-line-strong text-white/80 hover:border-white/25"
              }`}
            >
              <ChevronRight className="size-5" />
              Right
            </button>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-white/45">
              Tone frequency
            </span>
            <span className="text-sm tabular-nums text-white/70">{freq} Hz</span>
          </div>
          <input
            type="range"
            min={50}
            max={15000}
            step={10}
            value={freq}
            onChange={(e) => setFreq(Number(e.target.value))}
            className="mt-3 w-full accent-brand"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            {[100, 440, 1000, 5000, 10000].map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFreq(f)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  freq === f
                    ? "border-brand/50 bg-brand/10 text-brand"
                    : "border-line-strong text-white/70 hover:text-white"
                }`}
              >
                {f >= 1000 ? `${f / 1000}k` : f} Hz
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => playTone(0, "both")}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-brand px-5 text-sm font-semibold text-brand-foreground transition hover:bg-brand-soft"
          >
            <Play className="size-4" /> Play tone
          </button>
          <button
            type="button"
            onClick={playSweep}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-line-strong px-5 text-sm font-semibold text-white transition hover:border-white/25"
          >
            <Volume2 className="size-4" /> Frequency sweep
          </button>
          {active && (
            <button
              type="button"
              onClick={stop}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-line-strong px-5 text-sm font-semibold text-white transition hover:border-white/25"
            >
              <Square className="size-4 fill-current" /> Stop
            </button>
          )}
        </div>

        <label className="block">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-white/45">
              Volume
            </span>
            <span className="text-sm tabular-nums text-white/70">
              {Math.round(volume * 100)}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            className="mt-3 w-full accent-brand"
          />
        </label>
      </div>

      <p className="mt-6 text-xs text-white/40">
        No microphone needed — this tool only plays sound through your speakers
        or headphones. Nothing is recorded.
      </p>
    </div>
  );
}
