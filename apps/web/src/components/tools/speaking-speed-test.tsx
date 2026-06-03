"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Square, TriangleAlert, RotateCcw } from "lucide-react";
import { site } from "@/lib/site";

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult:
    | ((e: {
        resultIndex: number;
        results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }>;
      }) => void)
    | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

function rate(wpm: number) {
  if (wpm < 110) return { label: "Relaxed", note: "slower than average conversation" };
  if (wpm <= 150) return { label: "Conversational", note: "a clear, natural pace" };
  if (wpm <= 185) return { label: "Fast", note: "energetic — easy to lose listeners" };
  return { label: "Very fast", note: "consider slowing down for clarity" };
}

function fmt(ms: number) {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function SpeakingSpeedTest() {
  const [supported, setSupported] = useState(true);
  const [listening, setListening] = useState(false);
  const [finalText, setFinalText] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<{ wpm: number; words: number; ms: number } | null>(null);
  const [error, setError] = useState("");

  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const wantOnRef = useRef(false);
  const interimRef = useRef("");
  const finalRef = useRef("");
  const startRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const getCtor = () => {
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    return w.SpeechRecognition || w.webkitSpeechRecognition;
  };

  useEffect(() => {
    if (!getCtor()) setSupported(false);
    return () => {
      wantOnRef.current = false;
      recRef.current?.abort();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const countWords = (s: string) => (s.trim().match(/\S+/g) || []).length;

  const stop = useCallback(() => {
    wantOnRef.current = false;
    recRef.current?.stop();
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    const ms = performance.now() - startRef.current;
    const text = (finalRef.current + " " + interimRef.current).trim();
    const words = countWords(text);
    const minutes = ms / 60000;
    const wpm = minutes > 0 ? Math.round(words / minutes) : 0;
    setFinalText(text);
    setListening(false);
    setResult({ wpm, words, ms });
  }, []);

  const start = useCallback(() => {
    const Ctor = getCtor();
    if (!Ctor) {
      setSupported(false);
      return;
    }
    setError("");
    setResult(null);
    setFinalText("");
    finalRef.current = "";
    interimRef.current = "";

    const rec = new Ctor();
    recRef.current = rec;
    rec.lang = "en-US";
    rec.continuous = true;
    rec.interimResults = true;

    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) {
          const sep = finalRef.current && !/\s$/.test(finalRef.current) ? " " : "";
          finalRef.current += sep + res[0].transcript.trim();
        } else {
          interim += res[0].transcript;
        }
      }
      interimRef.current = interim;
      setFinalText((finalRef.current + " " + interim).trim());
    };

    rec.onerror = (ev) => {
      if (ev.error === "not-allowed" || ev.error === "service-not-allowed") {
        setError("Microphone permission was blocked. Allow it for this site, then try again.");
        wantOnRef.current = false;
        setListening(false);
        if (timerRef.current) clearInterval(timerRef.current);
      } else if (ev.error !== "no-speech" && ev.error !== "aborted") {
        setError(`Speech recognition error: ${ev.error}`);
      }
    };

    rec.onend = () => {
      if (wantOnRef.current) {
        try {
          rec.start();
        } catch {
          /* noop */
        }
      }
    };

    wantOnRef.current = true;
    startRef.current = performance.now();
    setElapsed(0);
    timerRef.current = setInterval(
      () => setElapsed(performance.now() - startRef.current),
      200,
    );
    try {
      rec.start();
      setListening(true);
    } catch {
      /* already started */
    }
  }, []);

  const reset = useCallback(() => {
    setResult(null);
    setFinalText("");
    setElapsed(0);
    finalRef.current = "";
    interimRef.current = "";
  }, []);

  if (!supported) {
    return (
      <div className="rounded-2xl border border-line bg-bg-elevated/40 p-6 md:p-8">
        <div className="flex gap-3 rounded-xl border border-line-strong bg-bg px-4 py-3.5">
          <TriangleAlert className="mt-0.5 size-5 shrink-0 text-brand" />
          <div>
            <p className="text-sm font-semibold text-white">
              This browser doesn&apos;t support in-browser speech recognition
            </p>
            <p className="mt-1 text-sm leading-relaxed text-white/55">
              The Web Speech API isn&apos;t available here. Try the latest Chrome
              or Edge — or get cross-platform dictation with{" "}
              <a
                href="/#download"
                className="text-white/80 underline-offset-4 hover:text-white hover:underline"
              >
                {site.name}
              </a>
              .
            </p>
          </div>
        </div>
      </div>
    );
  }

  const r = result ? rate(result.wpm) : null;

  return (
    <div className="rounded-2xl border border-line bg-bg-elevated/40 p-6 md:p-8">
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm">
            {listening && (
              <span className="size-2.5 animate-pulse rounded-full bg-red-500" />
            )}
            <span className="font-semibold text-white">
              {listening ? "Listening…" : result ? "Result" : "Ready"}
            </span>
            {(listening || elapsed > 0) && (
              <span className="tabular-nums text-white/45">{fmt(elapsed)}</span>
            )}
          </div>
          <div className="flex gap-2">
            {listening ? (
              <button
                type="button"
                onClick={stop}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-brand px-5 text-sm font-semibold text-brand-foreground transition hover:bg-brand-soft"
              >
                <Square className="size-4 fill-current" /> Stop &amp; measure
              </button>
            ) : result ? (
              <button
                type="button"
                onClick={reset}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-line-strong px-5 text-sm font-semibold text-white transition hover:border-white/25"
              >
                <RotateCcw className="size-4" /> Try again
              </button>
            ) : (
              <button
                type="button"
                onClick={start}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-brand px-5 text-sm font-semibold text-brand-foreground transition hover:bg-brand-soft"
              >
                <Mic className="size-4" /> Start &amp; speak
              </button>
            )}
          </div>
        </div>

        {result && r && (
          <div className="rounded-xl border border-line-strong bg-bg p-5 text-center">
            <p className="text-xs uppercase tracking-wider text-white/40">
              Your speaking speed
            </p>
            <p className="mt-1 font-display text-5xl tracking-tight text-white">
              {result.wpm}
              <span className="ml-1 text-xl text-white/50">wpm</span>
            </p>
            <p className="mt-2 text-sm font-semibold text-brand">{r.label}</p>
            <p className="text-sm text-white/45">{r.note}</p>
            <p className="mt-2 text-xs text-white/35">
              {result.words} words in {fmt(result.ms)}
            </p>
          </div>
        )}

        <div className="min-h-28 rounded-xl border border-line-strong bg-bg p-4 text-[15px] leading-relaxed">
          {finalText ? (
            <p className="whitespace-pre-wrap text-white/80">{finalText}</p>
          ) : (
            <p className="text-white/35">
              Press <span className="text-white/60">Start &amp; speak</span>,
              allow the microphone, and talk naturally for 20–30 seconds. Press
              stop to see your words per minute.
            </p>
          )}
        </div>

        {error && (
          <p className="flex items-center gap-2 text-sm text-amber-300/90">
            <TriangleAlert className="size-4 shrink-0" />
            {error}
          </p>
        )}
      </div>

      <p className="mt-6 text-xs text-white/40">
        Counts words from your browser&apos;s speech recognition, which may send
        audio to the browser vendor. For private, on-device dictation in any app,{" "}
        <a
          href="/#download"
          className="text-white/60 underline-offset-4 hover:text-white hover:underline"
        >
          use {site.name}
        </a>
        .
      </p>
    </div>
  );
}
