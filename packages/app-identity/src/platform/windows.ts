import { execFile as nodeExecFile } from 'node:child_process'
import { activeWindow, openWindows } from 'get-windows'
import type { RawAppIdentity } from '../contracts'

type StartAppRecord = { Name?: string; AppID?: string }

function parseStartApps(stdout: string): StartAppRecord[] {
  const trimmed = stdout.trim()
  if (!trimmed) return []

  const parsed = JSON.parse(trimmed) as StartAppRecord | StartAppRecord[]
  return Array.isArray(parsed) ? parsed : [parsed]
}

function normalizeName(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed.toLocaleLowerCase() : undefined
}

function buildAumidByName(startApps: StartAppRecord[]): Map<string, string> {
  const byName = new Map<string, string>()
  for (const item of startApps) {
    const name = normalizeName(item.Name)
    const aumid = item.AppID?.trim()
    if (!name || !aumid || byName.has(name)) continue
    byName.set(name, aumid)
  }
  return byName
}

function resolveAumid(
  appNameCandidates: Array<string | undefined>,
  aumidByName: Map<string, string>
): string | undefined {
  for (const candidate of appNameCandidates) {
    const name = normalizeName(candidate)
    if (!name) continue
    const aumid = aumidByName.get(name)
    if (aumid) return aumid
  }
  return undefined
}

async function loadStartApps(): Promise<StartAppRecord[]> {
  try {
    const stdout = await new Promise<string>((resolve, reject) => {
      nodeExecFile(
        'powershell',
        ['-NoProfile', '-Command', 'Get-StartApps | Select-Object Name,AppID | ConvertTo-Json'],
        (error, rawStdout) => {
          if (error) {
            reject(error)
            return
          }
          resolve(rawStdout ?? '')
        }
      )
    })
    return parseStartApps(stdout)
  } catch {
    return []
  }
}

export async function listWindowsApps(): Promise<RawAppIdentity[]> {
  const startApps = await loadStartApps()
  const aumidByName = buildAumidByName(startApps)
  const runningApps: RawAppIdentity[] = (await openWindows())
    .filter((item): item is typeof item & { owner: NonNullable<typeof item.owner> } => Boolean(item.owner?.path))
    .map((item) => ({
      displayName: item.owner.name ?? item.title ?? item.owner.path.split('\\').pop() ?? item.owner.path,
      platform: 'windows',
      path: item.owner.path,
      aumid: resolveAumid([item.owner.name, item.title], aumidByName),
      source: 'detected'
    }))

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
  const startApps = await loadStartApps()
  const aumidByName = buildAumidByName(startApps)

  return {
    displayName: window.owner.name ?? window.title ?? window.owner.path,
    platform: 'windows',
    path: window.owner.path,
    aumid: resolveAumid([window.owner.name, window.title], aumidByName),
    source: 'detected'
  }
}
