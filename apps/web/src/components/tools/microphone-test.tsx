"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff, CircleCheck, TriangleAlert } from "lucide-react";
import { LevelMeter } from "./level-meter";

type Status = "idle" | "requesting" | "active" | "denied" | "error" | "unsupported";

export function MicrophoneTest() {
  const [status, setStatus] = useState<Status>("idle");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string>("");
  const [level, setLevel] = useState(0);
  const [peak, setPeak] = useState(0);
  const [error, setError] = useState<string>("");

  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);

  const teardown = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
  }, []);

  // Feature-detect on mount; always release hardware on unmount.
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setStatus("unsupported");
    }
    return teardown;
  }, [teardown]);

  const start = useCallback(
    async (id?: string) => {
      teardown();
      setError("");
      setPeak(0);
      setStatus("requesting");
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: id ? { deviceId: { exact: id } } : true,
        });
        streamRef.current = stream;

        // Labels are only populated after permission is granted.
        const all = await navigator.mediaDevices.enumerateDevices();
        setDevices(all.filter((d) => d.kind === "audioinput"));
        const activeId = stream.getAudioTracks()[0]?.getSettings().deviceId;
        if (activeId) setDeviceId(activeId);

        const Ctx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        const ctx = new Ctx();
        ctxRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        source.connect(analyser);
        const data = new Uint8Array(analyser.fftSize);

        const tick = () => {
          analyser.getByteTimeDomainData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) {
            const v = (data[i] - 128) / 128;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / data.length);
          const next = Math.min(1, rms * 2.6);
          setLevel(next);
          setPeak((p) => (next > p ? next : p));
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
    },
    [teardown],
  );

  const stop = useCallback(() => {
    teardown();
    setLevel(0);
    setStatus("idle");
  }, [teardown]);

  const working = status === "active" && peak > 0.04;

  return (
    <div className="rounded-2xl border border-line bg-bg-elevated/40 p-6 md:p-8">
      {status === "unsupported" ? (
        <Notice
          icon={<TriangleAlert className="size-5" />}
          title="Microphone access isn't available"
          body="This browser doesn't expose the microphone API, or the page isn't served over HTTPS. Try the latest Chrome, Edge, Firefox, or Safari."
        />
      ) : (
        <div className="space-y-6">
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`inline-flex size-11 items-center justify-center rounded-xl border ${
                  status === "active"
                    ? "border-brand/40 bg-brand/10 text-brand"
                    : "border-line-strong bg-bg text-white/60"
                }`}
              >
                {status === "active" ? (
                  <Mic className="size-5" />
                ) : (
                  <MicOff className="size-5" />
                )}
              </div>
              <div>
                <p className="text-sm font-semibold text-white">
                  {status === "active"
                    ? "Listening…"
                    : status === "requesting"
                      ? "Requesting access…"
                      : "Microphone idle"}
                </p>
                <p className="text-xs text-white/45">
                  {status === "active"
                    ? "Speak normally — the bar should move."
                    : "Click start, then allow microphone access."}
                </p>
              </div>
            </div>

            {status === "active" ? (
              <button
                type="button"
                onClick={stop}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-line-strong px-5 text-sm font-semibold text-white transition hover:border-white/25"
              >
                <MicOff className="size-4" />
                Stop test
              </button>
            ) : (
              <button
                type="button"
                onClick={() => start(deviceId || undefined)}
                disabled={status === "requesting"}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-brand px-5 text-sm font-semibold text-brand-foreground transition hover:bg-brand-soft disabled:opacity-60"
              >
                <Mic className="size-4" />
                {status === "requesting" ? "Starting…" : "Start microphone test"}
              </button>
            )}
          </div>

          <LevelMeter value={level} />

          {working && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
              <CircleCheck className="size-4 shrink-0" />
              Your microphone is working — we detected sound from it.
            </div>
          )}

          {status === "active" && !working && (
            <p className="text-sm text-white/45">
              No sound detected yet. If the bar stays flat while you talk, check
              that the right input device is selected below and that your system
              isn&apos;t muted.
            </p>
          )}

          {status === "denied" && (
            <Notice
              icon={<TriangleAlert className="size-5" />}
              title="Microphone permission was blocked"
              body="Allow microphone access for this site in your browser's address-bar permission menu, then start the test again. Your audio stays in the browser — nothing is uploaded."
            />
          )}

          {status === "error" && (
            <Notice
              icon={<TriangleAlert className="size-5" />}
              title="Couldn't start the microphone"
              body={error}
            />
          )}

          {devices.length > 0 && (
            <label className="block">
              <span className="text-xs font-medium uppercase tracking-wider text-white/45">
                Input device
              </span>
              <select
                value={deviceId}
                onChange={(e) => {
                  setDeviceId(e.target.value);
                  if (status === "active") void start(e.target.value);
                }}
                className="mt-2 w-full rounded-xl border border-line-strong bg-bg px-3 py-2.5 text-sm text-white outline-none focus:border-brand/50"
              >
                {devices.map((d, i) => (
                  <option key={d.deviceId || i} value={d.deviceId}>
                    {d.label || `Microphone ${i + 1}`}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}

      <p className="mt-6 text-xs text-white/40">
        100% local: this test runs entirely in your browser and never records,
        stores, or uploads your audio.
      </p>
    </div>
  );
}

function Notice({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="flex gap-3 rounded-xl border border-line-strong bg-bg px-4 py-3.5">
      <span className="mt-0.5 shrink-0 text-brand">{icon}</span>
      <div>
        <p className="text-sm font-semibold text-white">{title}</p>
        <p className="mt-1 text-sm leading-relaxed text-white/55">{body}</p>
      </div>
    </div>
  );
}
