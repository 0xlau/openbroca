import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { OnboardingGateSnapshot, PermissionItem } from '../onboarding-gate/types'

function createSnapshot(overrides: Partial<OnboardingGateSnapshot> = {}): OnboardingGateSnapshot {
  return {
    platform: 'darwin',
    mode: 'first-run',
    canEnterMainWindow: false,
    permissionsOk: false,
    hasCompletedOnboarding: false,
    permissions: [
      {
        key: 'microphone',
        title: 'Microphone',
        description: 'Required to capture your voice.',
        status: 'missing'
      },
      {
        key: 'desktopControl',
        title: 'Desktop Control',
        description: 'Required to paste the final text into your current app.',
        status: 'needs-manual-step'
      }
    ],
    ...overrides
  }
}

function createPermission(
  overrides: Partial<PermissionItem> & Pick<PermissionItem, 'key'>
): PermissionItem {
  const { key, ...rest } = overrides

  return {
    key,
    title: key === 'microphone' ? 'Microphone' : 'Desktop Control',
    description:
      key === 'microphone'
        ? 'Required to capture your voice.'
        : 'Required to paste the final text into your current app.',
    status: 'missing',
    ...rest
  }
}

function mockElectronSystemPreferences() {
  const systemPreferences = {
    getMediaAccessStatus: vi.fn(),
    askForMediaAccess: vi.fn(),
    isTrustedAccessibilityClient: vi.fn()
  }
  const shell = {
    openExternal: vi.fn().mockResolvedValue(undefined)
  }

  vi.doMock('electron', () => ({
    shell,
    systemPreferences
  }))

  return { ...systemPreferences, shell }
}

function createTrackedWindow() {
  const listeners = new Map<string, () => void>()

  return {
    on: vi.fn((event: string, handler: () => void) => {
      listeners.set(event, handler)
    }),
    removeListener: vi.fn(),
    close: vi.fn(() => {
      listeners.get('closed')?.()
    }),
    isDestroyed: () => false,
    isFocused: () => false,
    minimize: vi.fn(),
    maximize: vi.fn(),
    unmaximize: vi.fn(),
    isMaximized: () => false,
    webContents: {
      send: vi.fn()
    }
  }
}

async function flushMainReadyWork(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

async function setupMainIndexHarness(options: {
  snapshots: OnboardingGateSnapshot[]
  microphonePermission?: PermissionItem
  desktopControlPermission?: PermissionItem
}) {
  const snapshotQueue = [...options.snapshots]
  const registeredHandlers = new Map<string, (...args: unknown[]) => unknown>()
  const appHandlers = new Map<string, (...args: unknown[]) => unknown>()
  const onDidChangeHandlers = new Map<string, (rawValue: unknown) => void>()
  const mainWindow = createTrackedWindow()
  let onboardingWindow: ReturnType<typeof createTrackedWindow> | null = null

  const resolveOnboardingGateSnapshot = vi.fn(
    async () => snapshotQueue.shift() ?? options.snapshots.at(-1) ?? createSnapshot()
  )
  const requestMicrophonePermission = vi.fn(
    async () =>
      options.microphonePermission ?? createPermission({ key: 'microphone', status: 'granted' })
  )
  const requestDesktopControlPermission = vi.fn(
    () =>
      options.desktopControlPermission ??
      createPermission({ key: 'desktopControl', status: 'needs-manual-step' })
  )
  const setAppUserModelId = vi.fn()
  const watchWindowShortcuts = vi.fn()
  const registerTrpcIpcHandler = vi.fn()
  const createHistoryAudioProtocolHandler = vi.fn(() => 'history-handler')
  const bindFloatingSessionController = vi.fn(() => ({
    getCaptureMode: vi.fn(() => null),
    updateShortcuts: vi.fn(),
    finishCapture: vi.fn(),
    dispose: vi.fn()
  }))
  const createMain = vi.fn(() => mainWindow)
  const createOnboarding = vi.fn(() => {
    onboardingWindow = createTrackedWindow()
    return onboardingWindow
  })
  const closeOnboarding = vi.fn(() => {
    onboardingWindow?.close()
  })
  const windowManager = {
    createMain,
    getMain: vi.fn(() => (createMain.mock.calls.length > 0 ? mainWindow : null)),
    createOnboarding,
    getOnboarding: vi.fn(() => onboardingWindow),
    closeOnboarding,
    destroyAll: vi.fn()
  }
  const app = {
    whenReady: vi.fn(() => Promise.resolve()),
    on: vi.fn((event: string, handler: (...args: unknown[]) => unknown) => {
      appHandlers.set(event, handler)
    }),
    quit: vi.fn(),
    getPath: vi.fn(() => '/tmp/test-userdata'),
    getFileIcon: vi.fn(async () => ({
      isEmpty: () => true,
      toDataURL: () => ''
    }))
  }
  const ipcMain = {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      registeredHandlers.set(channel, handler)
    })
  }
  const protocol = {
    registerSchemesAsPrivileged: vi.fn(),
    handle: vi.fn()
  }

  vi.doMock('electron', () => ({
    app,
    BrowserWindow: {
      getAllWindows: vi.fn(() => [])
    },
    clipboard: {
      readText: vi.fn(() => ''),
      writeText: vi.fn(),
      availableFormats: vi.fn(() => []),
      readBuffer: vi.fn(() => Buffer.from('')),
      writeBuffer: vi.fn(),
      clear: vi.fn()
    },
    ipcMain,
    protocol,
    screen: {
      getCursorScreenPoint: vi.fn(() => ({ x: 0, y: 0 })),
      getDisplayNearestPoint: vi.fn(() => ({
        workArea: { x: 0, y: 0, width: 1440, height: 900 }
      }))
    },
    systemPreferences: {
      getMediaAccessStatus: vi.fn(),
      askForMediaAccess: vi.fn(),
      isTrustedAccessibilityClient: vi.fn()
    }
  }))

  vi.doMock('@electron-toolkit/utils', () => ({
    electronApp: {
      setAppUserModelId
    },
    optimizer: {
      watchWindowShortcuts
    }
  }))
  vi.doMock('@openbroca/app-identity/discovery', () => ({
    createDiscoveryClient: () => ({
      listApps: async () => [],
      getFrontmostApp: async () => null
    })
  }))
  vi.doMock('@openbroca/app-identity/platform/macos', () => ({
    getMacFrontmostApp: vi.fn(async () => null),
    listMacApps: vi.fn(async () => [])
  }))
  vi.doMock('@openbroca/app-identity/platform/windows', () => ({
    getWindowsFrontmostApp: vi.fn(async () => null),
    listWindowsApps: vi.fn(async () => [])
  }))
  vi.doMock('../trpc/router', () => ({
    appTrpcRouter: {}
  }))
  vi.doMock('../trpc/context', () => ({
    createContext: vi.fn(() => ({}))
  }))
  vi.doMock('../trpc/ipc-handler', () => ({
    registerTrpcIpcHandler
  }))
  vi.doMock('../store', () => ({
    store: {
      get: vi.fn(() => ({})),
      onDidChange: vi.fn((key: string, handler: (rawValue: unknown) => void) => {
        onDidChangeHandlers.set(key, handler)
        return () => {
          onDidChangeHandlers.delete(key)
        }
      })
    }
  }))
  vi.doMock('../providers', () => ({
    llmRegistry: {},
    asrRegistry: {},
    registerLocalASRProviders: vi.fn()
  }))
  vi.doMock('../provider-host/host', () => ({
    getProviderHost: () => ({
      start: vi.fn(async () => undefined),
      dispose: vi.fn(async () => undefined),
      createInstance: vi.fn(async () => 'stub-instance'),
      invoke: vi.fn(async () => undefined),
      invokeStream: vi.fn(() =>
        (async function* () {
          yield* []
        })()
      )
    }),
    resetProviderHostSingleton: vi.fn()
  }))
  vi.doMock('../window-manager', () => ({
    windowManager
  }))
  vi.doMock('../shortcut-manager', () => ({
    shortcutManager: {
      stop: vi.fn()
    }
  }))
  vi.doMock('../floating-session-controller', () => ({
    bindFloatingSessionController
  }))
  vi.doMock('@openbroca/audio-capture', () => ({
    RtAudioCaptureSource: class {}
  }))
  vi.doMock('../listening-session', () => ({
    ListeningSessionManager: class {
      getState() {
        return { status: 'idle' }
      }

      subscribe() {
        return
      }

      stop() {
        return
      }

      cancelCapture() {
        return
      }

      cancelProcessing() {
        return
      }
    }
  }))
  vi.doMock('../history-repository', () => ({
    HistoryRepository: class {}
  }))
  vi.doMock('../instructions/matcher', () => ({
    createInstructionMatcher: vi.fn(() => vi.fn(async () => null))
  }))
  vi.doMock('../recording-storage', () => ({
    RecordingStorage: class {}
  }))
  vi.doMock('../post-recording-pipeline', () => ({
    createNormalizedCleanupPromptContextGetters: vi.fn(() => ({
      getDictionarySettings: vi.fn(() => undefined),
      getAboutMeSettings: vi.fn(() => undefined),
      getPromptTemplateSettings: vi.fn(() => undefined)
    })),
    PostRecordingPipeline: class {
      process() {
        return
      }
    }
  }))
  vi.doMock('../history-audio-protocol', () => ({
    HISTORY_AUDIO_PROTOCOL: 'history-audio',
    createHistoryAudioProtocolHandler
  }))
  vi.doMock('../providers/runtime', () => ({
    resolveActiveASRSelection: vi.fn(),
    resolveActiveLLMSelection: vi.fn()
  }))
  vi.doMock('../final-text-delivery/service', () => ({
    createFinalTextDeliveryService: vi.fn(() => ({}))
  }))
  vi.doMock('../final-text-delivery/platform/macos', () => ({
    createMacPasteText: vi.fn(() => vi.fn())
  }))
  vi.doMock('../final-text-delivery/platform/windows', () => ({
    createWindowsPasteText: vi.fn(() => vi.fn())
  }))
  vi.doMock('../send-key/auto-enter', () => ({
    createAutoEnterService: vi.fn(() => ({
      triggerAutoEnter: vi.fn()
    }))
  }))
  vi.doMock('../app-identity/service', () => ({
    AppIdentityService: class {
      getFrontmostApp() {
        return null
      }

      hydrateApp(app: unknown) {
        return app
      }
    }
  }))
  vi.doMock('../focused-input/service', () => ({
    FocusedInputAppService: class {
      getStrictFocusedInputApp() {
        return null
      }

      getFocusedInputApp() {
        return null
      }
    }
  }))
  vi.doMock('../focused-input/platform/windows', () => ({
    resolveWindowsFocusedInputApp: vi.fn(async () => null)
  }))
  vi.doMock('../auth/oauth-service', () => ({
    OAuthService: class {
      start() {
        return { providerId: 'openai-codex', status: 'not-connected' }
      }

      disconnect() {
        return { providerId: 'openai-codex', status: 'not-connected' }
      }

      dispose() {
        return
      }
    }
  }))
  vi.doMock('../auth/openai-codex-oauth', () => ({
    openaiCodexOAuth: {}
  }))
  vi.doMock('../auth/secure-storage', () => ({
    secureStorage: {}
  }))
  vi.doMock('../../shared/instructions', () => ({
    normalizeInstructionsSettings: vi.fn(() => [])
  }))
  vi.doMock('../../shared/shortcuts', () => ({
    normalizeShortcutSettings: vi.fn(() => ({}))
  }))
  vi.doMock('../notify-windows', () => ({
    createNotifyWindows: vi.fn(() => ({
      show: vi.fn(async () => undefined),
      getState: vi.fn(() => ({ visible: false }))
    }))
  }))
  vi.doMock('../onboarding-gate/service', () => ({
    requestMicrophonePermission,
    requestDesktopControlPermission
  }))
  vi.doMock('../onboarding-gate/service', () => ({
    resolveOnboardingGateSnapshot
  }))

  await import('../index')
  await flushMainReadyWork()

  return {
    app,
    appHandlers,
    registeredHandlers,
    onDidChangeHandlers,
    bindFloatingSessionController,
    createMain,
    createOnboarding,
    closeOnboarding,
    onboardingWindow: () => onboardingWindow,
    setOnboardingMissing() {
      onboardingWindow = null
    },
    resolveOnboardingGateSnapshot,
    requestMicrophonePermission,
    requestDesktopControlPermission
  }
}

describe('onboarding-gate request helpers', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  test('shows the system prompt when microphone access has never been asked', async () => {
    vi.stubGlobal('process', { ...process, platform: 'darwin' })
    const systemPreferences = mockElectronSystemPreferences()
    systemPreferences.askForMediaAccess.mockResolvedValue(true)
    systemPreferences.getMediaAccessStatus
      .mockReturnValueOnce('not-determined')
      .mockReturnValue('granted')

    const { requestMicrophonePermission } = await import('../onboarding-gate/service')

    await expect(requestMicrophonePermission()).resolves.toEqual(
      expect.objectContaining({ key: 'microphone', status: 'granted' })
    )
    expect(systemPreferences.askForMediaAccess).toHaveBeenCalledWith('microphone')
    expect(systemPreferences.shell.openExternal).not.toHaveBeenCalled()
  })

  test('opens System Settings when microphone access has been previously denied', async () => {
    vi.stubGlobal('process', { ...process, platform: 'darwin' })
    const systemPreferences = mockElectronSystemPreferences()
    systemPreferences.getMediaAccessStatus.mockReturnValue('denied')

    const { requestMicrophonePermission } = await import('../onboarding-gate/service')

    await expect(requestMicrophonePermission()).resolves.toEqual(
      expect.objectContaining({ key: 'microphone', status: 'needs-manual-step' })
    )
    expect(systemPreferences.askForMediaAccess).not.toHaveBeenCalled()
    expect(systemPreferences.shell.openExternal).toHaveBeenCalledWith(
      'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone'
    )
  })

  test('requests desktop control access and re-maps the refreshed state', async () => {
    vi.stubGlobal('process', { ...process, platform: 'darwin' })
    const systemPreferences = mockElectronSystemPreferences()
    systemPreferences.isTrustedAccessibilityClient
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true)

    const { requestDesktopControlPermission } = await import('../onboarding-gate/service')

    expect(requestDesktopControlPermission()).toEqual(
      expect.objectContaining({ key: 'desktopControl', status: 'granted' })
    )
    expect(systemPreferences.isTrustedAccessibilityClient).toHaveBeenNthCalledWith(1, true)
    expect(systemPreferences.isTrustedAccessibilityClient).toHaveBeenNthCalledWith(2, false)
  })

  test('request helpers stay startup-ready on Windows without macOS permission checks', async () => {
    vi.stubGlobal('process', { ...process, platform: 'win32' })
    const systemPreferences = mockElectronSystemPreferences()
    const { requestDesktopControlPermission, requestMicrophonePermission } =
      await import('../onboarding-gate/service')

    await expect(requestMicrophonePermission()).resolves.toEqual(
      expect.objectContaining({ key: 'microphone', status: 'granted' })
    )
    expect(requestDesktopControlPermission()).toEqual(
      expect.objectContaining({ key: 'desktopControl', status: 'granted' })
    )
    expect(systemPreferences.getMediaAccessStatus).not.toHaveBeenCalled()
    expect(systemPreferences.askForMediaAccess).not.toHaveBeenCalled()
    expect(systemPreferences.isTrustedAccessibilityClient).not.toHaveBeenCalled()
  })
})

describe('onboarding gate main-process flow', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  test('registers the permission onboarding IPC handlers', async () => {
    const harness = await setupMainIndexHarness({
      snapshots: [createSnapshot()]
    })

    expect(harness.registeredHandlers.has('permissions:get-snapshot')).toBe(true)
    expect(harness.registeredHandlers.has('permissions:request-microphone')).toBe(true)
    expect(harness.registeredHandlers.has('permissions:open-desktop-control-settings')).toBe(true)
    expect(harness.registeredHandlers.has('permissions:refresh')).toBe(true)
    expect(harness.registeredHandlers.has('permissions:quit-app')).toBe(true)
  })

  test('starts with the onboarding window when startup remains blocked', async () => {
    const harness = await setupMainIndexHarness({
      snapshots: [createSnapshot()]
    })

    expect(harness.bindFloatingSessionController).not.toHaveBeenCalled()
    expect(harness.createOnboarding).toHaveBeenCalledTimes(1)
    expect(harness.createMain).not.toHaveBeenCalled()
    expect(harness.onboardingWindow()?.on).toHaveBeenCalledWith('closed', expect.any(Function))
  })

  test('opens the main window instead of onboarding when startup is already ready', async () => {
    const harness = await setupMainIndexHarness({
      snapshots: [
        createSnapshot({
          mode: 'none',
          canEnterMainWindow: true,
          permissionsOk: true,
          hasCompletedOnboarding: true,
          permissions: [
            createPermission({ key: 'microphone', status: 'granted' }),
            createPermission({ key: 'desktopControl', status: 'granted' })
          ]
        })
      ]
    })

    expect(harness.bindFloatingSessionController).toHaveBeenCalledTimes(1)
    expect(harness.createMain).toHaveBeenCalledTimes(1)
    expect(harness.createOnboarding).not.toHaveBeenCalled()
  })

  test('refresh advances into the main window before closing onboarding when everything is granted', async () => {
    const grantedSnapshot = createSnapshot({
      mode: 'none',
      canEnterMainWindow: true,
      permissionsOk: true,
      hasCompletedOnboarding: true,
      permissions: [
        createPermission({ key: 'microphone', status: 'granted' }),
        createPermission({ key: 'desktopControl', status: 'granted' })
      ]
    })
    const harness = await setupMainIndexHarness({
      snapshots: [createSnapshot(), grantedSnapshot]
    })

    const refreshHandler = harness.registeredHandlers.get('permissions:refresh')
    const result = await refreshHandler?.({})

    expect(harness.bindFloatingSessionController).toHaveBeenCalledTimes(1)
    expect(harness.createMain).toHaveBeenCalledTimes(1)
    expect(harness.closeOnboarding).toHaveBeenCalledTimes(1)
    expect(harness.app.quit).not.toHaveBeenCalled()
    expect(result).toEqual(grantedSnapshot)
  })

  test('refresh recreates onboarding when the gate is still blocked and the window is missing', async () => {
    const blockedSnapshot = createSnapshot()
    const harness = await setupMainIndexHarness({
      snapshots: [blockedSnapshot, blockedSnapshot]
    })

    harness.setOnboardingMissing()

    const refreshHandler = harness.registeredHandlers.get('permissions:refresh')
    const result = await refreshHandler?.({})

    expect(harness.bindFloatingSessionController).not.toHaveBeenCalled()
    expect(harness.createOnboarding).toHaveBeenCalledTimes(2)
    expect(harness.createMain).not.toHaveBeenCalled()
    expect(result).toEqual(blockedSnapshot)
  })

  test('permission handlers proxy the request helpers and quit action', async () => {
    const refreshedMicrophoneSnapshot = createSnapshot({
      permissions: [
        createPermission({ key: 'microphone', status: 'granted' }),
        createPermission({ key: 'desktopControl', status: 'needs-manual-step' })
      ]
    })
    const refreshedDesktopSnapshot = createSnapshot({
      mode: 'none',
      canEnterMainWindow: true,
      permissionsOk: true,
      hasCompletedOnboarding: true,
      permissions: [
        createPermission({ key: 'microphone', status: 'granted' }),
        createPermission({ key: 'desktopControl', status: 'granted' })
      ]
    })
    const harness = await setupMainIndexHarness({
      snapshots: [createSnapshot(), refreshedMicrophoneSnapshot, refreshedDesktopSnapshot],
      microphonePermission: createPermission({ key: 'microphone', status: 'granted' }),
      desktopControlPermission: createPermission({
        key: 'desktopControl',
        status: 'needs-manual-step'
      })
    })

    const microphoneHandler = harness.registeredHandlers.get('permissions:request-microphone')
    const desktopControlHandler = harness.registeredHandlers.get(
      'permissions:open-desktop-control-settings'
    )
    const quitHandler = harness.registeredHandlers.get('permissions:quit-app')

    await expect(microphoneHandler?.({})).resolves.toEqual(refreshedMicrophoneSnapshot)
    await expect(desktopControlHandler?.({})).resolves.toEqual(refreshedDesktopSnapshot)
    await quitHandler?.({})

    expect(harness.requestMicrophonePermission).toHaveBeenCalledTimes(1)
    expect(harness.requestDesktopControlPermission).toHaveBeenCalledTimes(1)
    expect(harness.app.quit).toHaveBeenCalledTimes(1)
  })

  test('store onDidChange("onboarding") triggers refresh and advances when ready', async () => {
    const grantedSnapshot = createSnapshot({
      mode: 'none',
      canEnterMainWindow: true,
      permissionsOk: true,
      hasCompletedOnboarding: true,
      permissions: [
        createPermission({ key: 'microphone', status: 'granted' }),
        createPermission({ key: 'desktopControl', status: 'granted' })
      ]
    })
    const harness = await setupMainIndexHarness({
      snapshots: [createSnapshot(), grantedSnapshot]
    })

    const handler = harness.onDidChangeHandlers.get('onboarding')
    expect(handler).toBeDefined()

    handler?.({ completedAt: 1700000000000 })
    await Promise.resolve()
    await Promise.resolve()

    expect(harness.createMain).toHaveBeenCalledTimes(1)
    expect(harness.closeOnboarding).toHaveBeenCalledTimes(1)
  })
})
