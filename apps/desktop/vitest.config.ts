import path from 'node:path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

const rendererTestEnvironments: [string, string][] = [
  ['src/renderer/src/**/*.test.ts', 'jsdom'],
  ['src/renderer/src/**/*.test.tsx', 'jsdom']
]

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@renderer': path.resolve(__dirname, 'src/renderer/src')
    }
  },
  test: {
    environment: 'node',
    environmentMatchGlobs: rendererTestEnvironments,
    passWithNoTests: true
  }
})
