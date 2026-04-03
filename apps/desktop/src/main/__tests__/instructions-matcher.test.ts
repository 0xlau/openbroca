import { describe, expect, test, vi } from 'vitest'
import type { AppIdentity } from '@openbroca/app-identity'
import { normalizeInstructionsSettings, type InstructionsSettings } from '../../shared/instructions'
import { createInstructionMatcher } from '../instructions/matcher'

describe('createInstructionMatcher', () => {
  test('returns the matched rule for the unique frontmost app', async () => {
    const settings: InstructionsSettings = {
      rules: [
        {
          id: 'rule-coding',
          name: 'Coding',
          activationApps: [
            {
              id: 'com.todesktop.230313mzl4w4u92',
              displayName: 'Cursor',
              platform: 'macos',
              source: 'detected'
            }
          ],
          customInstructions: 'Prefer concise technical language.',
          autoEnter: true
        },
        {
          id: 'rule-writing',
          name: 'Writing',
          activationApps: [
            {
              id: 'company.thebrowser.Browser',
              displayName: 'Arc',
              platform: 'macos',
              source: 'detected'
            }
          ],
          customInstructions: 'Use reader-friendly style.',
          autoEnter: false
        }
      ]
    }

    const getFrontmostApp = vi.fn<() => Promise<AppIdentity | null>>().mockResolvedValue({
      id: 'com.todesktop.230313mzl4w4u92',
      displayName: 'Cursor',
      platform: 'macos',
      source: 'detected'
    })

    const matchInstruction = createInstructionMatcher({
      getInstructions: () => settings,
      getFrontmostApp
    })

    await expect(matchInstruction()).resolves.toEqual({
      ruleId: 'rule-coding',
      name: 'Coding',
      customInstructions: 'Prefer concise technical language.',
      autoEnter: true
    })
  })

  test('respects first-occurrence app ownership semantics after settings normalization', async () => {
    const settings = normalizeInstructionsSettings({
      rules: [
        {
          id: 'rule-coding',
          name: ' Coding ',
          activationApps: [
            {
              id: 'com.todesktop.230313mzl4w4u92',
              displayName: 'Cursor',
              platform: 'macos',
              source: 'detected'
            }
          ],
          customInstructions: 'Prefer concise technical language.',
          autoEnter: true
        },
        {
          id: 'rule-writing',
          name: ' Writing ',
          activationApps: [
            {
              id: 'com.todesktop.230313mzl4w4u92',
              displayName: 'Cursor Duplicate',
              platform: 'macos',
              source: 'detected'
            }
          ],
          customInstructions: 'Use reader-friendly style.',
          autoEnter: false
        }
      ]
    })

    const getFrontmostApp = vi.fn<() => Promise<AppIdentity | null>>().mockResolvedValue({
      id: 'com.todesktop.230313mzl4w4u92',
      displayName: 'Cursor',
      platform: 'macos',
      source: 'detected'
    })

    const matchInstruction = createInstructionMatcher({
      getInstructions: () => settings,
      getFrontmostApp
    })

    await expect(matchInstruction()).resolves.toEqual({
      ruleId: 'rule-coding',
      name: 'Coding',
      customInstructions: 'Prefer concise technical language.',
      autoEnter: true
    })
  })
})
