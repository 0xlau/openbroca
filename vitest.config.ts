import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@renderer': path.resolve(__dirname, 'apps/desktop/src/renderer/src')
    }
  },
  test: {
    environment: 'node',
    passWithNoTests: true
  }
})
