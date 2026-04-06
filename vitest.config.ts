import path from 'node:path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Repo-root vitest entrypoint so `pnpm vitest ...` can run desktop renderer tests
// that rely on the `@renderer/*` import alias.
const rendererTestEnvironments: [string, string][] = [
  ['apps/desktop/src/renderer/src/**/*.test.ts', 'jsdom'],
  ['apps/desktop/src/renderer/src/**/*.test.tsx', 'jsdom']
]

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@renderer': path.resolve(__dirname, 'apps/desktop/src/renderer/src')
    }
  },
  test: {
    environment: 'node',
    environmentMatchGlobs: rendererTestEnvironments,
    passWithNoTests: true
  }
})

