import { describe, expect, test, vi } from 'vitest'
import type { PermissionItem } from '../types'

vi.mock('../macos', () => ({
  resolveMacMicrophonePermission: vi.fn(),
  resolveMacDesktopControlPermission: vi.fn()
}))

const granted = (key: 'microphone' | 'desktopControl'): PermissionItem => ({
  key,
  title: key === 'microphone' ? 'Microphone' : 'Desktop Control',
  description: '',
  status: 'granted'
})

const missing = (key: 'microphone' | 'desktopControl'): PermissionItem => ({
  ...granted(key),
  status: 'missing'
})

describe('resolveOnboardingGateSnapshot', () => {
  test('first-run mode when completedAt is null (any permission state)', async () => {
    const { resolveMacMicrophonePermission, resolveMacDesktopControlPermission } =
      await import('../macos')
    ;(resolveMacMicrophonePermission as ReturnType<typeof vi.fn>).mockReturnValue(
      granted('microphone')
    )
    ;(resolveMacDesktopControlPermission as ReturnType<typeof vi.fn>).mockReturnValue(
      granted('desktopControl')
    )

    const { resolveOnboardingGateSnapshot } = await import('../service')
    const snapshot = await resolveOnboardingGateSnapshot(() => ({ completedAt: null }), 'darwin')

    expect(snapshot.mode).toBe('first-run')
    expect(snapshot.canEnterMainWindow).toBe(false)
    expect(snapshot.hasCompletedOnboarding).toBe(false)
    expect(snapshot.permissionsOk).toBe(true)
  })

  test('none mode when completedAt set and permissions OK', async () => {
    const { resolveMacMicrophonePermission, resolveMacDesktopControlPermission } =
      await import('../macos')
    ;(resolveMacMicrophonePermission as ReturnType<typeof vi.fn>).mockReturnValue(
      granted('microphone')
    )
    ;(resolveMacDesktopControlPermission as ReturnType<typeof vi.fn>).mockReturnValue(
      granted('desktopControl')
    )

    const { resolveOnboardingGateSnapshot } = await import('../service')
    const snapshot = await resolveOnboardingGateSnapshot(() => ({ completedAt: 100 }), 'darwin')

    expect(snapshot.mode).toBe('none')
    expect(snapshot.canEnterMainWindow).toBe(true)
  })

  test('permission-recovery mode when completedAt set but permissions missing', async () => {
    const { resolveMacMicrophonePermission, resolveMacDesktopControlPermission } =
      await import('../macos')
    ;(resolveMacMicrophonePermission as ReturnType<typeof vi.fn>).mockReturnValue(
      missing('microphone')
    )
    ;(resolveMacDesktopControlPermission as ReturnType<typeof vi.fn>).mockReturnValue(
      granted('desktopControl')
    )

    const { resolveOnboardingGateSnapshot } = await import('../service')
    const snapshot = await resolveOnboardingGateSnapshot(() => ({ completedAt: 100 }), 'darwin')

    expect(snapshot.mode).toBe('permission-recovery')
    expect(snapshot.canEnterMainWindow).toBe(false)
    expect(snapshot.permissionsOk).toBe(false)
  })

  test('non-darwin platforms: permissionsOk always true', async () => {
    const { resolveOnboardingGateSnapshot } = await import('../service')
    const snapshot = await resolveOnboardingGateSnapshot(() => ({ completedAt: 100 }), 'win32')

    expect(snapshot.permissionsOk).toBe(true)
    expect(snapshot.permissions).toEqual([])
    expect(snapshot.mode).toBe('none')
    expect(snapshot.canEnterMainWindow).toBe(true)
  })
})
