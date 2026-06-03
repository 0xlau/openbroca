import type { ComponentType } from "react";
import { AudioLines, AudioWaveform } from "lucide-react";

// Deep-import only the lightweight monochrome (`currentColor`) marks so we never
// pull in the heavy `@lobehub/ui` dependency that the icons' `.Avatar`/`.Combine`
// statics rely on.
import OpenAI from "@lobehub/icons/es/OpenAI/components/Mono";
import Anthropic from "@lobehub/icons/es/Anthropic/components/Mono";
import Gemini from "@lobehub/icons/es/Gemini/components/Mono";
import Mistral from "@lobehub/icons/es/Mistral/components/Mono";
import Groq from "@lobehub/icons/es/Groq/components/Mono";
import Perplexity from "@lobehub/icons/es/Perplexity/components/Mono";
import Together from "@lobehub/icons/es/Together/components/Mono";
import Fireworks from "@lobehub/icons/es/Fireworks/components/Mono";
import DeepSeek from "@lobehub/icons/es/DeepSeek/components/Mono";
import Ollama from "@lobehub/icons/es/Ollama/components/Mono";
import LmStudio from "@lobehub/icons/es/LmStudio/components/Mono";
import OpenRouter from "@lobehub/icons/es/OpenRouter/components/Mono";
import Qwen from "@lobehub/icons/es/Qwen/components/Mono";
import Zhipu from "@lobehub/icons/es/Zhipu/components/Mono";
import Kimi from "@lobehub/icons/es/Kimi/components/Mono";
import Grok from "@lobehub/icons/es/Grok/components/Mono";

export type ProviderIconType = ComponentType<{
  size?: number | string;
  className?: string;
}>;

export type ProviderKind = "asr" | "llm";

export type Provider = {
  name: string;
  kind: ProviderKind;
  local?: boolean;
  Icon: ProviderIconType;
};

const icon = (c: unknown) => c as ProviderIconType;

export const providers: Provider[] = [
  // Speech recognition (ASR)
  { name: "Deepgram", kind: "asr", Icon: icon(AudioLines) },
  { name: "Sherpa-ONNX", kind: "asr", local: true, Icon: icon(AudioWaveform) },
  // Language models (LLM)
  { name: "OpenAI", kind: "llm", Icon: icon(OpenAI) },
  { name: "Anthropic", kind: "llm", Icon: icon(Anthropic) },
  { name: "Google Gemini", kind: "llm", Icon: icon(Gemini) },
  { name: "Mistral", kind: "llm", Icon: icon(Mistral) },
  { name: "Groq", kind: "llm", Icon: icon(Groq) },
  { name: "Perplexity", kind: "llm", Icon: icon(Perplexity) },
  { name: "Together", kind: "llm", Icon: icon(Together) },
  { name: "Fireworks", kind: "llm", Icon: icon(Fireworks) },
  { name: "DeepSeek", kind: "llm", Icon: icon(DeepSeek) },
  { name: "Ollama", kind: "llm", local: true, Icon: icon(Ollama) },
  { name: "LM Studio", kind: "llm", local: true, Icon: icon(LmStudio) },
  { name: "OpenRouter", kind: "llm", Icon: icon(OpenRouter) },
  { name: "Qwen", kind: "llm", Icon: icon(Qwen) },
  { name: "Zhipu", kind: "llm", Icon: icon(Zhipu) },
  { name: "Kimi", kind: "llm", Icon: icon(Kimi) },
  { name: "xAI", kind: "llm", Icon: icon(Grok) },
];
