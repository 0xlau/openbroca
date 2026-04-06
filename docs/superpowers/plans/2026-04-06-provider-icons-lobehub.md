# Provider Icons LobeHub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace provider icons in `packages/providers` with `@lobehub/icons` assets where LobeHub coverage exists, while keeping unsupported providers on local SVGs and preserving renderer compatibility.

**Architecture:** Centralize provider icon selection in `packages/providers/src/shared/icons/index.ts`, using `@lobehub/icons` CDN URLs for covered providers and local inline SVG fallbacks for the remaining unsupported ones. Update the desktop renderer to treat provider icons as either inline SVG markup or remote URLs, and loosen CSP only for the chosen LobeHub asset host.

**Tech Stack:** TypeScript, Vitest, Electron renderer CSP, `@lobehub/icons`

---

### Task 1: Lock Icon Source Expectations With Tests

**Files:**
- Create: `packages/providers/src/shared/icons/index.test.ts`
- Create: `apps/desktop/src/renderer/src/components/providers/provider-types.test.ts`

- [ ] **Step 1: Write the failing provider icon mapping test**

```ts
import { describe, expect, it } from 'vitest'
import { providerIcons } from './index.ts'

describe('providerIcons', () => {
  it('uses LobeHub SVG CDN icons for supported providers', () => {
    expect(providerIcons.openai).toBe(
      'https://unpkg.com/@lobehub/icons-static-svg@latest/icons/openai-color.svg'
    )
    expect(providerIcons['openai-codex']).toBe(
      'https://unpkg.com/@lobehub/icons-static-svg@latest/icons/codex-color.svg'
    )
    expect(providerIcons.openrouter).toBe(
      'https://unpkg.com/@lobehub/icons-static-svg@latest/icons/openrouter-color.svg'
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @openbroca/providers test -- src/shared/icons/index.test.ts`
Expected: FAIL because the current icon map still uses local SVG strings and does not expose all supported LobeHub-backed provider keys.

- [ ] **Step 3: Write the failing renderer icon source test**

```ts
import { describe, expect, it } from 'vitest'
import { resolveProviderIconSrc } from './provider-types'

describe('resolveProviderIconSrc', () => {
  it('wraps inline svg markup in a data URI', () => {
    expect(resolveProviderIconSrc('<svg viewBox="0 0 1 1"></svg>')).toMatch(
      /^data:image\/svg\+xml,/
    )
  })

  it('returns remote icon URLs unchanged', () => {
    const url = 'https://unpkg.com/@lobehub/icons-static-svg@latest/icons/openai-color.svg'

    expect(resolveProviderIconSrc(url)).toBe(url)
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm --filter desktop test -- src/renderer/src/components/providers/provider-types.test.ts`
Expected: FAIL because `resolveProviderIconSrc` does not exist yet.

### Task 2: Centralize Provider Icon Selection

**Files:**
- Modify: `packages/providers/src/shared/icons/index.ts`
- Modify: `packages/providers/src/llm/providers/openai/index.ts`
- Modify: `packages/providers/src/llm/providers/openai-codex/index.ts`
- Modify: `packages/providers/src/llm/providers/openrouter/index.ts`
- Modify: `packages/providers/src/asr/providers/deepgram/index.ts`
- Modify: `packages/providers/src/asr/providers/sherpa-onnx/index.ts`
- Modify: `packages/providers/package.json`

- [ ] **Step 1: Add `@lobehub/icons` to the providers package**

Run: `pnpm --filter @openbroca/providers add @lobehub/icons`
Expected: `packages/providers/package.json` and `pnpm-lock.yaml` include `@lobehub/icons`.

- [ ] **Step 2: Replace supported provider icon sources with LobeHub CDN URLs**

```ts
import { getLobeIconCDN } from '@lobehub/icons'

const lobeSvg = (id: string) => getLobeIconCDN(id, { cdn: 'unpkg', format: 'svg', type: 'color' })
```

Use that helper for `openai`, `openai-codex`, `openrouter`, `anthropic`, `azure-speech`, `google-gemini`, `google-speech`, `mistral`, and `ollama`. Keep `deepgram`, `sherpa-onnx`, and `openai-whisper` on local inline SVGs.

- [ ] **Step 3: Point provider descriptors at the shared icon map**

```ts
import { providerIcons } from '../../../shared/icons/index.ts'

icon: providerIcons.openai
```

Apply the same pattern to every provider descriptor in `packages/providers`.

- [ ] **Step 4: Run providers tests to verify they pass**

Run: `pnpm --filter @openbroca/providers test -- src/shared/icons/index.test.ts src/llm/providers/openrouter/__tests__/descriptor.test.ts src/llm/providers/openai-codex/__tests__/descriptor.test.ts src/asr/providers/deepgram/__tests__/descriptor.test.ts src/asr/providers/sherpa-onnx/__tests__/descriptor.test.ts`
Expected: PASS

### Task 3: Teach The Renderer To Accept URL Icons

**Files:**
- Modify: `apps/desktop/src/renderer/src/components/providers/provider-types.ts`
- Modify: `apps/desktop/src/renderer/src/components/providers/provider-row.tsx`
- Modify: `apps/desktop/src/renderer/index.html`

- [ ] **Step 1: Add a dedicated icon source resolver**

```ts
export function resolveProviderIconSrc(icon?: string): string | undefined {
  const value = icon?.trim()
  if (!value) return undefined
  if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('data:')) {
    return value
  }
  return svgToDataUri(value)
}
```

- [ ] **Step 2: Update the provider row to use the resolved icon source**

```tsx
const iconSrc = resolveProviderIconSrc(provider.icon)
```

Render `iconSrc` directly in `<img src={iconSrc} />`.

- [ ] **Step 3: Allow the chosen LobeHub asset host in the renderer CSP**

```html
img-src 'self' data: https://unpkg.com
```

- [ ] **Step 4: Run desktop tests to verify they pass**

Run: `pnpm --filter desktop test -- src/renderer/src/components/providers/provider-types.test.ts src/renderer/src/pages/main/__tests__/providers.test.tsx`
Expected: PASS

### Task 4: Final Verification

**Files:**
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Run focused package verification**

Run: `pnpm --filter @openbroca/providers typecheck && pnpm --filter desktop typecheck`
Expected: PASS

- [ ] **Step 2: Re-run the targeted tests**

Run: `pnpm --filter @openbroca/providers test -- src/shared/icons/index.test.ts && pnpm --filter desktop test -- src/renderer/src/components/providers/provider-types.test.ts`
Expected: PASS
