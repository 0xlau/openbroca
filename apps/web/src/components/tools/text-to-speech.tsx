"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Play, Pause, Square, TriangleAlert } from "lucide-react";

const SAMPLE =
  "OpenBroca turns your speech into text in any app. Type this box full of words, pick a voice, and press play to hear it read aloud.";

export function TextToSpeech() {
  const [supported, setSupported] = useState(true);
  const [text, setText] = useState(SAMPLE);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceURI, setVoiceURI] = useState("");
  const [rate, setRate] = useState(1);
  const [pitch, setPitch] = useState(1);
  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);

  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setSupported(false);
      return;
    }
    const load = () => {
      const list = window.speechSynthesis.getVoices();
      if (list.length) {
        setVoices(list);
        setVoiceURI((cur) => {
          if (cur) return cur;
          const def =
            list.find((v) => v.default) ||
            list.find((v) => v.lang.startsWith("en")) ||
            list[0];
          return def?.voiceURI ?? "";
        });
      }
    };
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", load);
      window.speechSynthesis.cancel();
    };
  }, []);

  const play = useCallback(() => {
    if (!text.trim()) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const voice = voices.find((v) => v.voiceURI === voiceURI);
    if (voice) {
      u.voice = voice;
      u.lang = voice.lang;
    }
    u.rate = rate;
    u.pitch = pitch;
    u.onend = () => {
      setSpeaking(false);
      setPaused(false);
    };
    u.onerror = () => {
      setSpeaking(false);
      setPaused(false);
    };
    utterRef.current = u;
    window.speechSynthesis.speak(u);
    setSpeaking(true);
    setPaused(false);
  }, [text, voices, voiceURI, rate, pitch]);

  const pause = useCallback(() => {
    window.speechSynthesis.pause();
    setPaused(true);
  }, []);

  const resume = useCallback(() => {
    window.speechSynthesis.resume();
    setPaused(false);
  }, []);

  const stop = useCallback(() => {
    window.speechSynthesis.cancel();
    setSpeaking(false);
    setPaused(false);
  }, []);

  if (!supported) {
    return (
      <div className="rounded-2xl border border-line bg-bg-elevated/40 p-6 md:p-8">
        <div className="flex gap-3 rounded-xl border border-line-strong bg-bg px-4 py-3.5">
          <TriangleAlert className="mt-0.5 size-5 shrink-0 text-brand" />
          <div>
            <p className="text-sm font-semibold text-white">
              Text-to-speech isn&apos;t available in this browser
            </p>
            <p className="mt-1 text-sm leading-relaxed text-white/55">
              The Web Speech Synthesis API isn&apos;t supported here. Try the
              latest Chrome, Edge, Safari, or Firefox.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-line bg-bg-elevated/40 p-6 md:p-8">
      <div className="space-y-5">
        <label className="block">
          <span className="sr-only">Text to read aloud</span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            placeholder="Type or paste text to read aloud…"
            className="w-full resize-y rounded-xl border border-line-strong bg-bg p-4 text-[15px] leading-relaxed text-white/90 outline-none placeholder:text-white/30 focus:border-brand/50"
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="text-xs font-medium uppercase tracking-wider text-white/45">
              Voice
            </span>
            <select
              value={voiceURI}
              onChange={(e) => setVoiceURI(e.target.value)}
              className="mt-2 w-full rounded-xl border border-line-strong bg-bg px-3 py-2.5 text-sm text-white outline-none focus:border-brand/50"
            >
              {voices.length === 0 && <option>Loading voices…</option>}
              {voices.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name} ({v.lang})
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="flex justify-between text-xs font-medium uppercase tracking-wider text-white/45">
              <span>Speed</span>
              <span className="tabular-nums text-white/60">
                {rate.toFixed(1)}×
              </span>
            </span>
            <input
              type="range"
              min={0.5}
              max={2}
              step={0.1}
              value={rate}
              onChange={(e) => setRate(Number(e.target.value))}
              className="mt-3.5 w-full accent-brand"
            />
          </label>

          <label className="block">
            <span className="flex justify-between text-xs font-medium uppercase tracking-wider text-white/45">
              <span>Pitch</span>
              <span className="tabular-nums text-white/60">
                {pitch.toFixed(1)}
              </span>
            </span>
            <input
              type="range"
              min={0}
              max={2}
              step={0.1}
              value={pitch}
              onChange={(e) => setPitch(Number(e.target.value))}
              className="mt-3.5 w-full accent-brand"
            />
          </label>
        </div>

        <div className="flex gap-2">
          {!speaking || paused ? (
            <button
              type="button"
              onClick={speaking && paused ? resume : play}
              disabled={!text.trim()}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-brand px-5 text-sm font-semibold text-brand-foreground transition hover:bg-brand-soft disabled:opacity-50"
            >
              <Play className="size-4" />
              {speaking && paused ? "Resume" : "Play"}
            </button>
          ) : (
            <button
              type="button"
              onClick={pause}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-line-strong px-5 text-sm font-semibold text-white transition hover:border-white/25"
            >
              <Pause className="size-4" /> Pause
            </button>
          )}
          <button
            type="button"
            onClick={stop}
            disabled={!speaking}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-line-strong px-5 text-sm font-semibold text-white transition hover:border-white/25 disabled:opacity-40"
          >
            <Square className="size-4 fill-current" /> Stop
          </button>
        </div>
      </div>

      <p className="mt-6 text-xs text-white/40">
        100% local: speech is synthesized on-device by your operating
        system&apos;s voices. Nothing you type is uploaded.
      </p>
    </div>
  );
}
