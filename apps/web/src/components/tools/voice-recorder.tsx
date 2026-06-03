"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Mic,
  Square,
  Pause,
  Play,
  Download,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";
import { LevelMeter } from "./level-meter";

type Status =
  | "idle"
  | "requesting"
  | "recording"
  | "paused"
  | "recorded"
  | "denied"
  | "error"
  | "unsupported";

function fmt(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function extFor(mime: string) {
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("mp4") || mime.includes("aac") || mime.includes("m4a"))
    return "m4a";
  if (mime.includes("wav")) return "wav";
  return "webm";
}

export function VoiceRecorder() {
  const [status, setStatus] = useState<Status>("idle");
  const [level, setLevel] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [url, setUrl] = useState("");
  const [ext, setExt] = useState("webm");
  const [error, setError] = useState("");

  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const accRef = useRef(0); // accumulated ms across pauses
  const segStartRef = useRef(0); // start of current running segment
  const urlRef = useRef("");

  const stopMeter = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }, []);

  const release = useCallback(() => {
    stopMeter();
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
  }, [stopMeter]);

  useEffect(() => {
    const ok =
      typeof navigator !== "undefined" &&
      typeof navigator.mediaDevices?.getUserMedia === "function" &&
      typeof window !== "undefined" &&
      "MediaRecorder" in window;
    if (!ok) setStatus("unsupported");
    return () => {
      release();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, [release]);

  const runMeter = useCallback((analyser: AnalyserNode) => {
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
  }, []);

  const analyserRef = useRef<AnalyserNode | null>(null);

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
        const type = rec.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        const objectUrl = URL.createObjectURL(blob);
        urlRef.current = objectUrl;
        setUrl(objectUrl);
        setExt(extFor(type));
        release();
        setLevel(0);
        setStatus("recorded");
      };

      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new Ctx();
      ctxRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      ctx.createMediaStreamSource(stream).connect(analyser);
      analyserRef.current = analyser;
      runMeter(analyser);

      accRef.current = 0;
      segStartRef.current = performance.now();
      setElapsed(0);
      timerRef.current = setInterval(() => {
        const running =
          recRef.current?.state === "recording"
            ? performance.now() - segStartRef.current
            : 0;
        setElapsed(accRef.current + running);
      }, 200);

      rec.start();
      setStatus("recording");
    } catch (err) {
      const e = err as DOMException;
      release();
      if (e.name === "NotAllowedError" || e.name === "SecurityError") {
        setStatus("denied");
      } else {
        setStatus("error");
        setError(e.message || "Could not access the microphone.");
      }
    }
  }, [release, runMeter]);

  const pause = useCallback(() => {
    if (recRef.current?.state !== "recording") return;
    recRef.current.pause();
    accRef.current += performance.now() - segStartRef.current;
    stopMeter();
    setLevel(0);
    setStatus("paused");
  }, [stopMeter]);

  const resume = useCallback(() => {
    if (recRef.current?.state !== "paused") return;
    recRef.current.resume();
    segStartRef.current = performance.now();
    if (analyserRef.current) runMeter(analyserRef.current);
    setStatus("recording");
  }, [runMeter]);

  const stop = useCallback(() => {
    if (recRef.current && recRef.current.state !== "inactive") {
      if (recRef.current.state === "paused") {
        // already accumulated on pause
      } else {
        accRef.current += performance.now() - segStartRef.current;
      }
      recRef.current.stop();
    }
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

  const recordingOrPaused = status === "recording" || status === "paused";

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
                  : status === "paused"
                    ? "Paused"
                    : status === "recorded"
                      ? "Recording ready"
                      : status === "requesting"
                        ? "Requesting access…"
                        : "Ready to record"}
              </span>
              {(recordingOrPaused || elapsed > 0) && (
                <span className="tabular-nums text-white/45">{fmt(elapsed)}</span>
              )}
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              {status === "recording" && (
                <button
                  type="button"
                  onClick={pause}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-line-strong px-4 text-sm font-semibold text-white transition hover:border-white/25"
                >
                  <Pause className="size-4" /> Pause
                </button>
              )}
              {status === "paused" && (
                <button
                  type="button"
                  onClick={resume}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-line-strong px-4 text-sm font-semibold text-white transition hover:border-white/25"
                >
                  <Play className="size-4" /> Resume
                </button>
              )}
              {recordingOrPaused && (
                <button
                  type="button"
                  onClick={stop}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-brand px-4 text-sm font-semibold text-brand-foreground transition hover:bg-brand-soft"
                >
                  <Square className="size-4 fill-current" /> Stop
                </button>
              )}
              {status === "recorded" && (
                <button
                  type="button"
                  onClick={reset}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-line-strong px-4 text-sm font-semibold text-white transition hover:border-white/25"
                >
                  <RotateCcw className="size-4" /> New recording
                </button>
              )}
              {(status === "idle" ||
                status === "denied" ||
                status === "error" ||
                status === "requesting") && (
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

          {recordingOrPaused && <LevelMeter value={level} />}

          {status === "recorded" && url && (
            <div className="space-y-3">
              <audio src={url} controls className="w-full" />
              <a
                href={url}
                download={`openbroca-recording.${ext}`}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-white px-5 text-sm font-semibold text-black transition hover:bg-white/90"
              >
                <Download className="size-4" />
                Download recording (.{ext})
              </a>
            </div>
          )}

          {status === "denied" && (
            <Notice
              title="Microphone permission was blocked"
              body="Allow microphone access for this site in your browser's address-bar permission menu, then start again."
            />
          )}
          {status === "error" && (
            <Notice title="Couldn't start recording" body={error} />
          )}
        </div>
      )}

      <p className="mt-6 text-xs text-white/40">
        100% local: recording and downloading happen entirely in your browser.
        Your audio is never sent to a server.
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
