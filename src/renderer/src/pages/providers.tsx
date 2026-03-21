import React from 'react'
import { Button } from '@renderer/components/ui/button'
import { Separator } from '@renderer/components/ui/separator'
import {
  TypographyH3,
  TypographyLarge,
  TypographyMuted,
  TypographySmall
} from '@renderer/components/ui/typography'
import { HugeiconsIcon } from '@hugeicons/react'
import { PlusSignIcon } from '@hugeicons/core-free-icons'
import openaiLogo from '@renderer/assets/ai/openai.svg'
import anthropicLogo from '@renderer/assets/ai/anthropic.svg'
import geminiLogo from '@renderer/assets/ai/gemini.svg'
import ollamaLogo from '@renderer/assets/ai/ollama.svg'
import azureaiLogo from '@renderer/assets/ai/azureai.svg'
import mistralLogo from '@renderer/assets/ai/mistral.svg'
import deepgramLogo from '@renderer/assets/ai/deepgram.svg'
import googleLogo from '@renderer/assets/ai/google.svg'

interface Provider {
  id: string
  name: string
  description: string
  configured: boolean
  logo: string
  icon?: string
}

const ASR_PROVIDERS: Provider[] = [
  {
    id: 'openai-whisper',
    name: 'OpenAI Whisper',
    description: 'High-accuracy speech recognition powered by OpenAI',
    configured: true,
    logo: 'OW',
    icon: openaiLogo
  },
  {
    id: 'azure-speech',
    name: 'Azure Speech',
    description: 'Microsoft Azure Cognitive Services Speech-to-Text',
    configured: false,
    logo: 'AZ',
    icon: azureaiLogo
  },
  {
    id: 'deepgram',
    name: 'Deepgram',
    description: 'Real-time and batch transcription API',
    configured: false,
    logo: 'DG',
    icon: deepgramLogo
  },
  {
    id: 'google-speech',
    name: 'Google Speech',
    description: 'Google Cloud Speech-to-Text API',
    configured: false,
    logo: 'GS',
    icon: googleLogo
  }
]

const LLM_PROVIDERS: Provider[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT-4o and o-series models via OpenAI API',
    configured: true,
    logo: 'OA',
    icon: openaiLogo
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Claude 3.5 / 4 series models via Anthropic API',
    configured: true,
    logo: 'AN',
    icon: anthropicLogo
  },
  {
    id: 'google-gemini',
    name: 'Google Gemini',
    description: 'Gemini Pro and Flash models via Google AI Studio',
    configured: false,
    logo: 'GG',
    icon: geminiLogo
  },
  {
    id: 'mistral',
    name: 'Mistral AI',
    description: 'Mistral and Mixtral models via La Plateforme',
    configured: false,
    logo: 'MS',
    icon: mistralLogo
  },
  {
    id: 'ollama',
    name: 'Ollama',
    description: 'Run open-source models locally on your machine',
    configured: false,
    logo: 'OL',
    icon: ollamaLogo
  }
]

function ProviderRow({ provider, isLast }: { provider: Provider; isLast: boolean }) {
  return (
    <>
      <div className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/50">
        {provider.icon ? (
          <img
            src={provider.icon}
            alt={provider.name}
            className="size-9 shrink-0 object-contain p-1"
          />
        ) : (
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted ring-1 ring-foreground/10">
            <span className="text-xs font-semibold text-muted-foreground">{provider.logo}</span>
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <TypographySmall>{provider.name}</TypographySmall>
          </div>
          <TypographyMuted className="mt-1 truncate">{provider.description}</TypographyMuted>
        </div>
        <Button
          variant={provider.configured ? 'ghost' : 'secondary'}
          size="sm"
          className="shrink-0 gap-1.5"
        >
          {provider.configured ? null : <HugeiconsIcon icon={PlusSignIcon} size={14} />}
          {provider.configured ? 'Disconnect' : 'Connect'}
        </Button>
      </div>
      {!isLast && <Separator />}
    </>
  )
}

function ProviderSection({ title, providers }: { title: string; providers: Provider[] }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2.5 px-1">
        <TypographyLarge>{title}</TypographyLarge>
      </div>
      <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
        {providers.map((provider, index) => (
          <ProviderRow
            key={provider.id}
            provider={provider}
            isLast={index === providers.length - 1}
          />
        ))}
      </div>
    </section>
  )
}

function ProviderContainer() {
  return (
    <div className="space-y-8">
      <ProviderSection title="ASR Providers" providers={ASR_PROVIDERS} />
      <Separator />
      <ProviderSection title="LLM Providers" providers={LLM_PROVIDERS} />
    </div>
  )
}

export const Providers: React.FC = () => {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <TypographyH3 className="text-left">Providers</TypographyH3>
        <TypographyMuted className="not-first:mt-2">
          Manage API credentials for speech and language model providers.
        </TypographyMuted>
      </div>
      <ProviderContainer />
    </div>
  )
}
