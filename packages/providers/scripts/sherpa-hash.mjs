#!/usr/bin/env node
/**
 * Compute the sha256 of a sherpa-onnx model archive by streaming the
 * download from the manifest entry's URL. Use this when you want strict
 * integrity verification for a model that ships without a sha256 in
 * `manifest.ts`.
 *
 *   node packages/providers/scripts/sherpa-hash.mjs <model-id>
 *   node packages/providers/scripts/sherpa-hash.mjs --all
 *
 * The script doesn't write to manifest.ts — it prints the value so you can
 * paste it in. That keeps the change visible in code review.
 */
import * as crypto from 'node:crypto'
import * as https from 'node:https'
import { pathToFileURL } from 'node:url'

async function loadManifest() {
  const url = pathToFileURL(
    new URL('../src/asr/providers/sherpa-onnx/manifest.ts', import.meta.url).pathname
  )
  // tsx is required so this script can import the .ts manifest directly.
  const mod = await import(url.href).catch(async () => {
    // Fallback: if tsx isn't available, parse the file with a simple regex.
    // This only extracts id / downloadUrl / sha256 / sizeBytes — enough for
    // this script's needs.
    const fs = await import('node:fs')
    const path = await import('node:path')
    const file = path.resolve(
      new URL('../src/asr/providers/sherpa-onnx/manifest.ts', import.meta.url).pathname
    )
    const text = fs.readFileSync(file, 'utf8')
    const entries = []
    const blockRe = /\{[^{}]*?id:\s*'([^']+)'[^{}]*?\}/gs
    for (const match of text.matchAll(blockRe)) {
      const block = match[0]
      const id = match[1]
      const urlMatch = block.match(/downloadUrl:\s*[`'"]([^`'"]+)[`'"]/)
      const sha256Match = block.match(/sha256:\s*['"]([^'"]+)['"]/)
      const sizeMatch = block.match(/sizeBytes:\s*([\d_]+)/)
      if (urlMatch) {
        entries.push({
          id,
          downloadUrl: urlMatch[1].replace(/\$\{RELEASE_BASE\}/g, 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models'),
          sha256: sha256Match?.[1],
          sizeBytes: sizeMatch ? Number(sizeMatch[1].replace(/_/g, '')) : undefined
        })
      }
    }
    return { DEFAULT_SHERPA_MODELS: entries }
  })
  return mod.DEFAULT_SHERPA_MODELS
}

function downloadSha256(url, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    if (redirectsLeft < 0) {
      reject(new Error('Too many redirects'))
      return
    }
    const req = https.get(url, (res) => {
      const status = res.statusCode ?? 0
      if (status === 301 || status === 302) {
        const location = res.headers.location
        if (!location) return reject(new Error('Redirect without Location'))
        downloadSha256(location, redirectsLeft - 1).then(resolve, reject)
        res.resume()
        return
      }
      if (status !== 200) {
        reject(new Error(`HTTP ${status}`))
        res.resume()
        return
      }
      const total = Number.parseInt(res.headers['content-length'] ?? '0', 10)
      const hash = crypto.createHash('sha256')
      let downloaded = 0
      let lastReport = 0
      res.on('data', (chunk) => {
        downloaded += chunk.length
        hash.update(chunk)
        const now = Date.now()
        if (now - lastReport > 500) {
          const pct = total ? ((downloaded / total) * 100).toFixed(1) : '?'
          process.stderr.write(`\r  ${(downloaded / 1_000_000).toFixed(1)} MB / ${(total / 1_000_000).toFixed(1)} MB (${pct}%)`)
          lastReport = now
        }
      })
      res.on('end', () => {
        process.stderr.write('\n')
        resolve({ sha256: hash.digest('hex'), bytes: downloaded })
      })
      res.on('error', reject)
    })
    req.on('error', reject)
  })
}

async function main() {
  const args = process.argv.slice(2)
  if (args.length === 0) {
    console.error('Usage: sherpa-hash.mjs <model-id> | --all')
    process.exit(2)
  }

  const manifest = await loadManifest()
  const wanted =
    args[0] === '--all' ? manifest : manifest.filter((m) => args.includes(m.id))

  if (wanted.length === 0) {
    console.error(`Unknown model id(s): ${args.join(', ')}`)
    console.error(`Known ids: ${manifest.map((m) => m.id).join(', ')}`)
    process.exit(2)
  }

  for (const entry of wanted) {
    process.stderr.write(`[${entry.id}] downloading ${entry.downloadUrl}\n`)
    try {
      const { sha256, bytes } = await downloadSha256(entry.downloadUrl)
      const sizeMatch = entry.sizeBytes != null && entry.sizeBytes !== bytes
        ? ` (manifest sizeBytes=${entry.sizeBytes} ≠ actual ${bytes})`
        : ''
      console.log(`${entry.id}  ${sha256}  bytes=${bytes}${sizeMatch}`)
    } catch (err) {
      console.error(`[${entry.id}] FAILED: ${err.message}`)
    }
  }
}

main()
