import type { BrowserWindow } from 'electron'
import type { OnboardingGateSnapshot } from './types'

export type OnboardingWatcherDeps = {
  resolve: () => Promise<OnboardingGateSnapshot>
  pushSnapshot: (snapshot: OnboardingGateSnapshot) => void
  onMaybeAdvance: () => Promise<OnboardingGateSnapshot>
  pollIntervalMs?: number
}

const DEFAULT_POLL_INTERVAL_MS = 1500

export class OnboardingWatcher {
  private readonly deps: OnboardingWatcherDeps
  private readonly pollIntervalMs: number
  private window: BrowserWindow | null = null
  private pollIntervalId: NodeJS.Timeout | null = null
  private lastSnapshotJson: string | null = null
  private isTicking = false
  private stopped = false

  private readonly handleFocus = (): void => this.startPolling()
  private readonly handleBlur = (): void => this.stopPolling()
  private readonly handleClosed = (): void => this.stop()

  constructor(deps: OnboardingWatcherDeps) {
    this.deps = deps
    this.pollIntervalMs = deps.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS
  }

  start(window: BrowserWindow): void {
    if (this.stopped || this.window) return

    this.window = window
    window.on('focus', this.handleFocus)
    window.on('blur', this.handleBlur)
    window.on('closed', this.handleClosed)

    if (window.isFocused()) this.startPolling()
  }

  stop(): void {
    if (this.stopped) return
    this.stopped = true
    this.stopPolling()

    const window = this.window
    this.window = null
    if (!window) return

    window.removeListener('focus', this.handleFocus)
    window.removeListener('blur', this.handleBlur)
    window.removeListener('closed', this.handleClosed)
  }

  private startPolling(): void {
    if (this.stopped) return
    void this.tick()
    if (this.pollIntervalId) return
    this.pollIntervalId = setInterval(() => {
      void this.tick()
    }, this.pollIntervalMs)
  }

  private stopPolling(): void {
    if (this.pollIntervalId) {
      clearInterval(this.pollIntervalId)
      this.pollIntervalId = null
    }
  }

  private async tick(): Promise<void> {
    if (this.stopped || this.isTicking) return
    this.isTicking = true
    try {
      const snapshot = await this.deps.resolve()
      const json = JSON.stringify(snapshot)
      if (json === this.lastSnapshotJson) return
      this.lastSnapshotJson = json
      this.deps.pushSnapshot(snapshot)
      await this.deps.onMaybeAdvance()
    } catch (error) {
      console.warn('[OnboardingWatcher] tick failed', error)
    } finally {
      this.isTicking = false
    }
  }
}
