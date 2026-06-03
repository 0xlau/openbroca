"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Square, TriangleAlert } from "lucide-react";
import { LevelMeter } from "./level-meter";

type Status = "idle" | "requesting" | "active" | "denied" | "error" | "unsupported";

function classify(db: number) {
  if (db < -55) return { label: "Very quiet", note: "Great for recording or calls.", color: "text-emerald-300" };
  if (db < -45) return { label: "Quiet", note: "Good — little background noise.", color: "text-emerald-300" };
  if (db < -35) return { label: "Moderate", note: "Some background noise is present.", color: "text-amber-300" };
  if (db < -25) return { label: "Noisy", note: "Background noise may be distracting.", color: "text-orange-300" };
  return { label: "Very noisy", note: "Try a quieter spot or a closer mic.", color: "text-red-300" };
}

// Map a dBFS value (~ -70 quiet … -10 loud) onto a 0–1 meter range.
const toMeter = (db: number) => Math.max(0, Math.min(1, (db + 70) / 60));

export function BackgroundNoiseTest() {
  const [status, setStatus] = useState<Status>("idle");
  const [db, setDb] = useState(-70);
  const [error, setError] = useState("");

  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const smoothRef = useRef(-70);

  const teardown = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
  }, []);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setStatus("unsupported");
    }
    return teardown;
  }, [teardown]);

  const start = useCallback(async () => {
    teardown();
    setError("");
    setStatus("requesting");
    smoothRef.current = -70;
    try {
      // Disable processing so we measure the true ambient floor where possible.
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      streamRef.current = stream;

      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new Ctx();
      ctxRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const data = new Uint8Array(analyser.fftSize);

      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        const instant = rms > 0 ? 20 * Math.log10(rms) : -100;
        // Exponential smoothing for a stable noise-floor reading.
        smoothRef.current = smoothRef.current * 0.9 + instant * 0.1;
        setDb(smoothRef.current);
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
      setStatus("active");
    } catch (err) {
      const e = err as DOMException;
      if (e.name === "NotAllowedError" || e.name === "SecurityError") {
        setStatus("denied");
      } else {
        setStatus("error");
        setError(e.message || "Could not access the microphone.");
      }
    }
  }, [teardown]);

  const stop = useCallback(() => {
    teardown();
    setStatus("idle");
    setDb(-70);
  }, [teardown]);

  const c = classify(db);

  return (
    <div className="rounded-2xl border border-line bg-bg-elevated/40 p-6 md:p-8">
      {status === "unsupported" ? (
        <Notice
          title="Microphone access isn't available"
          body="This browser doesn't expose the microphone API, or the page isn't served over HTTPS. Try the latest Chrome, Edge, Firefox, or Safari."
        />
      ) : (
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-sm">
              {status === "active" && (
                <span className="size-2.5 animate-pulse rounded-full bg-brand" />
              )}
              <span className="font-semibold text-white">
                {status === "active"
                  ? "Measuring…"
                  : status === "requesting"
                    ? "Requesting access…"
                    : "Ready"}
              </span>
            </div>
            {status === "active" ? (
              <button
                type="button"
                onClick={stop}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-line-strong px-5 text-sm font-semibold text-white transition hover:border-white/25"
              >
                <Square className="size-4 fill-current" /> Stop
              </button>
            ) : (
              <button
                type="button"
                onClick={start}
                disabled={status === "requesting"}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-brand px-5 text-sm font-semibold text-brand-foreground transition hover:bg-brand-soft disabled:opacity-60"
              >
                <Mic className="size-4" />
                {status === "requesting" ? "Starting…" : "Measure background noise"}
              </button>
            )}
          </div>

          {status === "active" && (
            <>
              <LevelMeter value={toMeter(db)} />
              <div className="rounded-xl border border-line-strong bg-bg p-5 text-center">
                <p className="text-xs uppercase tracking-wider text-white/40">
                  Noise floor (relative)
                </p>
                <p className="mt-1 font-display text-4xl tracking-tight text-white tabular-nums">
                  {Math.round(db)} dBFS
                </p>
                <p className={`mt-2 text-sm font-semibold ${c.color}`}>{c.label}</p>
                <p className="text-sm text-white/45">{c.note}</p>
              </div>
              <p className="text-sm text-white/45">
                Stay silent for a few seconds and let the reading settle — it
                reflects the steady background noise around you, not your voice.
              </p>
            </>
          )}

          {status === "denied" && (
            <Notice
              title="Microphone permission was blocked"
              body="Allow microphone access for this site in your browser's address-bar permission menu, then start again."
            />
          )}
          {status === "error" && (
            <Notice title="Couldn't start the microphone" body={error} />
          )}
        </div>
      )}

      <p className="mt-6 text-xs text-white/40">
        This is a relative reading in dBFS, not a calibrated sound-level (dB SPL)
        measurement — use it to compare rooms and setups, not for exact figures.
        Audio is analysed locally and never uploaded.
      </p>
    </div>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex gap-3 rounded-xl border border-line-strong bg-bg px-4 py-3.5">
      <TriangleAlert className="mt-0.5 size-5 shrink-0 text-brand" />
      <div>
        <p className="text-sm font-semibold text-white">{title}</p>
        <p className="mt-1 text-sm leading-relaxed text-white/55">{body}</p>
      </div>
    </div>
  );
}
