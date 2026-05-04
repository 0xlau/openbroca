import { describe, expect, test } from 'vitest'
import {
  defaultOnboardingState,
  normalizeOnboardingState,
  type OnboardingState
} from '../onboarding'

describe('normalizeOnboardingState', () => {
  test('returns defaults for null/undefined/non-object', () => {
    expect(normalizeOnboardingState(null)).toEqual(defaultOnboardingState)
    expect(normalizeOnboardingState(undefined)).toEqual(defaultOnboardingState)
    expect(normalizeOnboardingState('string')).toEqual(defaultOnboardingState)
    expect(normalizeOnboardingState(42)).toEqual(defaultOnboardingState)
  })

  test('extracts numeric completedAt', () => {
    const result = normalizeOnboardingState({ completedAt: 1700000000000 })
    expect(result).toEqual({ completedAt: 1700000000000 } satisfies OnboardingState)
  })

  test('falls back to null when completedAt is non-number', () => {
    expect(normalizeOnboardingState({ completedAt: 'invalid' })).toEqual({ completedAt: null })
    expect(normalizeOnboardingState({})).toEqual({ completedAt: null })
  })
})
