import {
  defaultOnboardingState,
  normalizeOnboardingState,
  type OnboardingState
} from '../../../shared/onboarding'
import { createPersistedStore } from './create-persisted-store'

export type { OnboardingState }

export const onboardingStore = createPersistedStore<OnboardingState>({
  key: 'onboarding',
  defaults: defaultOnboardingState,
  normalize: normalizeOnboardingState
})

export async function markOnboardingComplete(): Promise<void> {
  await onboardingStore.getState().replace({ completedAt: Date.now() })
}
