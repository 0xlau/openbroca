import { readdir } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { activeWindow, openWindows } from 'get-windows'
import type { RawAppIdentity } from '../contracts'

const WINDOW_QUERY_OPTIONS = {
  accessibilityPermission: false,
  screenRecordingPermission: false
} as const

export async function listMacApps(): Promise<RawAppIdentity[]> {
  const roots = ['/Applications', path.join(os.homedir(), 'Applications')]
  const runningApps: RawAppIdentity[] = (await openWindows(WINDOW_QUERY_OPTIONS))
    .filter((item): item is (typeof item & { owner: NonNullable<typeof item.owner> }) => Boolean(item.owner?.path))
    .map((item) => ({
      displayName: item.owner.name ?? item.title ?? item.owner.path,
      platform: 'macos',
      bundleId: item.platform === 'macos' ? item.owner.bundleId : undefined,
      path: item.owner.path,
      source: 'detected'
    }))
  const results: RawAppIdentity[] = [...runningApps]

  for (const root of roots) {
    try {
      const entries = await readdir(root, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory() || !entry.name.endsWith('.app')) continue
        const appPath = path.join(root, entry.name)
        results.push({
          displayName: entry.name.replace(/\.app$/u, ''),
          platform: 'macos',
          path: appPath,
          source: 'detected'
        })
      }
    } catch {}
  }

  return results
}

export async function getMacFrontmostApp(): Promise<RawAppIdentity | null> {
  const window = await activeWindow(WINDOW_QUERY_OPTIONS)
  if (!window?.owner?.path) return null

  return {
    displayName: window.owner.name ?? window.title ?? window.owner.path,
    platform: 'macos',
    bundleId: window.platform === 'macos' ? window.owner.bundleId : undefined,
    path: window.owner.path,
    source: 'detected'
  }
}
