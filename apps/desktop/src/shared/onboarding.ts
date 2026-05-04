export interface OnboardingState {
  completedAt: number | null
}

export const defaultOnboardingState: OnboardingState = { completedAt: null }

export function normalizeOnboardingState(raw: unknown): OnboardingState {
  if (raw == null || typeof raw !== 'object') {
    return defaultOnboardingState
  }
  const value = raw as Partial<OnboardingState>
  if (typeof value.completedAt === 'number') {
    return { completedAt: value.completedAt }
  }
  return { completedAt: null }
}
