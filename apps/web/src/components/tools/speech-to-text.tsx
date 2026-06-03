"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Square, Copy, Check, Trash2, TriangleAlert } from "lucide-react";
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
        results: ArrayLike<{
          0: { transcript: string };
          isFinal: boolean;
        }>;
      }) => void)
    | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

const LANGS = [
  { code: "en-US", label: "English (US)" },
  { code: "en-GB", label: "English (UK)" },
  { code: "es-ES", label: "Spanish" },
  { code: "fr-FR", label: "French" },
  { code: "de-DE", label: "German" },
  { code: "it-IT", label: "Italian" },
  { code: "pt-BR", label: "Portuguese (BR)" },
  { code: "zh-CN", label: "Chinese (Mandarin)" },
  { code: "ja-JP", label: "Japanese" },
  { code: "ko-KR", label: "Korean" },
  { code: "hi-IN", label: "Hindi" },
  { code: "ru-RU", label: "Russian" },
];

export function SpeechToText() {
  const [supported, setSupported] = useState(true);
  const [listening, setListening] = useState(false);
  const [lang, setLang] = useState("en-US");
  const [finalText, setFinalText] = useState("");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const wantOnRef = useRef(false);

  useEffect(() => {
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) {
      setSupported(false);
      return;
    }
    return () => {
      wantOnRef.current = false;
      recRef.current?.abort();
    };
  }, []);

  const stop = useCallback(() => {
    wantOnRef.current = false;
    recRef.current?.stop();
    setListening(false);
    setInterim("");
  }, []);

  const start = useCallback(() => {
    setError("");
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) {
      setSupported(false);
      return;
    }

    const rec = new Ctor();
    recRef.current = rec;
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;

    rec.onresult = (e) => {
      let interimChunk = "";
      let finalChunk = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const text = res[0].transcript;
        if (res.isFinal) finalChunk += text;
        else interimChunk += text;
      }
      if (finalChunk) {
        setFinalText((prev) => {
          const sep = prev && !/\s$/.test(prev) ? " " : "";
          return prev + sep + finalChunk.trim();
        });
      }
      setInterim(interimChunk);
    };

    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setError(
          "Microphone permission was blocked. Allow it for this site, then start again.",
        );
        wantOnRef.current = false;
        setListening(false);
      } else if (e.error === "no-speech" || e.error === "aborted") {
        // benign — ignore
      } else {
        setError(`Speech recognition error: ${e.error}`);
      }
    };

    rec.onend = () => {
      // Browsers stop after silence; restart if the user is still listening.
      if (wantOnRef.current) {
        try {
          rec.start();
        } catch {
          setListening(false);
        }
      } else {
        setListening(false);
        setInterim("");
      }
    };

    wantOnRef.current = true;
    try {
      rec.start();
      setListening(true);
    } catch {
      // start() throws if already started — ignore.
    }
  }, [lang]);

  const copy = useCallback(() => {
    const text = (finalText + " " + interim).trim();
    if (!text) return;
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [finalText, interim]);

  const clear = useCallback(() => {
    setFinalText("");
    setInterim("");
  }, []);

  const words = (finalText.trim().match(/\S+/g) || []).length;

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
              The Web Speech API isn&apos;t available here (Firefox and some
              browsers don&apos;t ship it). Try the latest Chrome or Edge — or
              get real, cross-platform dictation that works in every app with{" "}
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

  return (
    <div className="rounded-2xl border border-line bg-bg-elevated/40 p-6 md:p-8">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm">
            {listening && (
              <span className="size-2.5 animate-pulse rounded-full bg-red-500" />
            )}
            <span className="font-semibold text-white">
              {listening ? "Listening…" : "Ready"}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <label className="sr-only" htmlFor="stt-lang">
              Recognition language
            </label>
            <select
              id="stt-lang"
              value={lang}
              onChange={(e) => {
                setLang(e.target.value);
                if (listening) {
                  stop();
                }
              }}
              className="h-11 rounded-full border border-line-strong bg-bg px-4 text-sm text-white outline-none focus:border-brand/50"
            >
              {LANGS.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
            {listening ? (
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
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-brand px-5 text-sm font-semibold text-brand-foreground transition hover:bg-brand-soft"
              >
                <Mic className="size-4" /> Start dictation
              </button>
            )}
          </div>
        </div>

        <div className="min-h-40 rounded-xl border border-line-strong bg-bg p-4 text-[15px] leading-relaxed">
          {finalText || interim ? (
            <p className="whitespace-pre-wrap text-white/90">
              {finalText}
              {interim && (
                <span className="text-white/40">
                  {finalText ? " " : ""}
                  {interim}
                </span>
              )}
            </p>
          ) : (
            <p className="text-white/35">
              Press <span className="text-white/60">Start dictation</span>, allow
              the microphone, and start speaking. Your words appear here in real
              time.
            </p>
          )}
        </div>

        {error && (
          <p className="flex items-center gap-2 text-sm text-amber-300/90">
            <TriangleAlert className="size-4 shrink-0" />
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-white/40">{words} words</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={copy}
              disabled={!finalText && !interim}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-line-strong px-4 text-xs font-semibold text-white/80 transition hover:text-white disabled:opacity-40"
            >
              {copied ? (
                <Check className="size-3.5" />
              ) : (
                <Copy className="size-3.5" />
              )}
              {copied ? "Copied" : "Copy"}
            </button>
            <button
              type="button"
              onClick={clear}
              disabled={!finalText && !interim}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-line-strong px-4 text-xs font-semibold text-white/80 transition hover:text-white disabled:opacity-40"
            >
              <Trash2 className="size-3.5" /> Clear
            </button>
          </div>
        </div>
      </div>

      <p className="mt-6 text-xs text-white/40">
        This demo uses your browser&apos;s built-in speech engine, which may send
        audio to the browser vendor&apos;s servers. For fully offline, on-device
        dictation that types into any app,{" "}
        <a
          href="/offline-speech-to-text"
          className="text-white/60 underline-offset-4 hover:text-white hover:underline"
        >
          use {site.name}
        </a>
        .
      </p>
    </div>
  );
}
