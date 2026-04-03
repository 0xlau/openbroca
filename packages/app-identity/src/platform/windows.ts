import { execFile as nodeExecFile } from 'node:child_process'
import { promisify } from 'node:util'
import { activeWindow, openWindows } from 'get-windows'
import type { RawAppIdentity } from '../contracts'

const execFile = promisify(nodeExecFile)

type StartAppRecord = { Name?: string; AppID?: string }

function parseStartApps(stdout: string): StartAppRecord[] {
  const trimmed = stdout.trim()
  if (!trimmed) return []

  const parsed = JSON.parse(trimmed) as StartAppRecord | StartAppRecord[]
  return Array.isArray(parsed) ? parsed : [parsed]
}

export async function listWindowsApps(): Promise<RawAppIdentity[]> {
  const runningApps: RawAppIdentity[] = (await openWindows())
    .map((item) => item.owner)
    .filter((owner): owner is NonNullable<typeof owner> => Boolean(owner?.path))
    .map((owner) => ({
      displayName: owner.name ?? owner.path.split('\\').pop() ?? owner.path,
      platform: 'windows',
      path: owner.path,
      source: 'detected'
    }))

  let startApps: StartAppRecord[] = []
  try {
    const { stdout } = await execFile('powershell', [
      '-NoProfile',
      '-Command',
      'Get-StartApps | Select-Object Name,AppID | ConvertTo-Json'
    ])
    startApps = parseStartApps(stdout)
  } catch {}

  return [
    ...runningApps,
    ...startApps
      .filter((item) => item.AppID)
      .map((item) => ({
        displayName: item.Name ?? item.AppID ?? 'Unknown App',
        platform: 'windows' as const,
        aumid: item.AppID,
        source: 'detected' as const
      }))
  ]
}

export async function getWindowsFrontmostApp(): Promise<RawAppIdentity | null> {
  const window = await activeWindow()
  if (!window?.owner?.path) return null

  return {
    displayName: window.owner.name ?? window.title ?? window.owner.path,
    platform: 'windows',
    path: window.owner.path,
    source: 'detected'
  }
}
