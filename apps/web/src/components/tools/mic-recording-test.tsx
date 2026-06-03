"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Square, RotateCcw, CircleCheck, TriangleAlert } from "lucide-react";
import { LevelMeter } from "./level-meter";

type Status =
  | "idle"
  | "requesting"
  | "recording"
  | "recorded"
  | "denied"
  | "error"
  | "unsupported";

function fmt(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function MicRecordingTest() {
  const [status, setStatus] = useState<Status>("idle");
  const [level, setLevel] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [url, setUrl] = useState<string>("");
  const [error, setError] = useState("");

  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const urlRef = useRef<string>("");

  const releaseStream = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
  }, []);

  useEffect(() => {
    const ok =
      typeof navigator !== "undefined" &&
      typeof navigator.mediaDevices?.getUserMedia === "function" &&
      typeof window !== "undefined" &&
      "MediaRecorder" in window;
    if (!ok) setStatus("unsupported");
    return () => {
      releaseStream();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, [releaseStream]);

  const start = useCallback(async () => {
    setError("");
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = "";
      setUrl("");
    }
    setStatus("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const rec = new MediaRecorder(stream);
      recRef.current = rec;
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: rec.mimeType || "audio/webm",
        });
        const objectUrl = URL.createObjectURL(blob);
        urlRef.current = objectUrl;
        setUrl(objectUrl);
        releaseStream();
        setLevel(0);
        setStatus("recorded");
      };

      // Live meter while recording.
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new Ctx();
      ctxRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        setLevel(Math.min(1, Math.sqrt(sum / data.length) * 2.6));
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();

      startRef.current = performance.now();
      setElapsed(0);
      timerRef.current = setInterval(
        () => setElapsed(performance.now() - startRef.current),
        200,
      );

      rec.start();
      setStatus("recording");
    } catch (err) {
      const e = err as DOMException;
      releaseStream();
      if (e.name === "NotAllowedError" || e.name === "SecurityError") {
        setStatus("denied");
      } else {
        setStatus("error");
        setError(e.message || "Could not access the microphone.");
      }
    }
  }, [releaseStream]);

  const stop = useCallback(() => {
    recRef.current?.stop();
  }, []);

  const reset = useCallback(() => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = "";
    }
    setUrl("");
    setElapsed(0);
    setStatus("idle");
  }, []);

  return (
    <div className="rounded-2xl border border-line bg-bg-elevated/40 p-6 md:p-8">
      {status === "unsupported" ? (
        <Notice
          title="Recording isn't available"
          body="This browser doesn't support in-page audio recording, or the page isn't served over HTTPS. Try the latest Chrome, Edge, Firefox, or Safari."
        />
      ) : (
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-sm">
              {status === "recording" && (
                <span className="size-2.5 animate-pulse rounded-full bg-red-500" />
              )}
              <span className="font-semibold text-white">
                {status === "recording"
                  ? "Recording"
                  : status === "recorded"
                    ? "Playback"
                    : status === "requesting"
                      ? "Requesting access…"
                      : "Ready"}
              </span>
              {(status === "recording" || elapsed > 0) && (
                <span className="tabular-nums text-white/45">{fmt(elapsed)}</span>
              )}
            </div>

            <div className="flex gap-2">
              {status === "recording" ? (
                <button
                  type="button"
                  onClick={stop}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-line-strong px-5 text-sm font-semibold text-white transition hover:border-white/25"
                >
                  <Square className="size-4 fill-current" />
                  Stop
                </button>
              ) : status === "recorded" ? (
                <button
                  type="button"
                  onClick={reset}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-line-strong px-5 text-sm font-semibold text-white transition hover:border-white/25"
                >
                  <RotateCcw className="size-4" />
                  Record again
                </button>
              ) : (
                <button
                  type="button"
                  onClick={start}
                  disabled={status === "requesting"}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-brand px-5 text-sm font-semibold text-brand-foreground transition hover:bg-brand-soft disabled:opacity-60"
                >
                  <Mic className="size-4" />
                  {status === "requesting" ? "Starting…" : "Start recording"}
                </button>
              )}
            </div>
          </div>

          {status === "recording" && <LevelMeter value={level} />}

          {status === "recorded" && url && (
            <div className="space-y-3">
              <audio src={url} controls className="w-full" />
              <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
                <CircleCheck className="size-4 shrink-0" />
                Recorded. Press play above — if you can hear yourself clearly,
                your mic is capturing audio correctly.
              </div>
            </div>
          )}

          {status === "denied" && (
            <Notice
              title="Microphone permission was blocked"
              body="Allow microphone access for this site in your browser's address-bar permission menu, then try again."
            />
          )}
          {status === "error" && (
            <Notice title="Couldn't start recording" body={error} />
          )}
        </div>
      )}

      <p className="mt-6 text-xs text-white/40">
        100% local: the recording is held only in your browser for playback and
        is never uploaded. Reload the page and it&apos;s gone.
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
