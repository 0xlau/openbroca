import { readFileSync } from 'fs'
import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import svgr from 'vite-plugin-svgr'

// Inlines SVG file content as a raw string when bundling the main process.
// Needed because @openbroca/* workspace packages are bundled (not externalized),
// and Node.js/esbuild cannot natively handle .svg file extensions.
const svgRawPlugin: Plugin = {
  name: 'svg-raw-loader',
  enforce: 'pre',
  load(id: string) {
    const cleanId = id.split('?')[0]
    if (cleanId.endsWith('.svg')) {
      return `export default ${JSON.stringify(readFileSync(cleanId, 'utf-8'))}`
    }
    return null
  }
}

export default defineConfig({
  main: {
    build: {
      // electron-vite externalizes all dependencies by default.
      // Workspace packages must be bundled so Vite plugins (e.g. svgRawPlugin)
      // can process their imports before Node.js sees them.
      externalizeDeps: {
        exclude: ['@openbroca/providers', '@openbroca/audio-capture', '@openbroca/app-identity']
      },
      rollupOptions: {
        // audify is a native addon (.node file) — must stay external even though
        // its parent @openbroca/audio-capture is bundled.
        // get-windows also ships native-install machinery we should leave to
        // Node resolution instead of bundling into the Electron main build.
        // sherpa-onnx-node loads platform-specific native binaries
        // (sherpa-onnx-darwin-arm64 etc.) via runtime require; Vite must not
        // try to bundle either the wrapper or its optional platform deps.
        external: [
          'audify',
          'get-windows',
          'sherpa-onnx-node',
          /^sherpa-onnx-(darwin|linux|win)-/
        ]
      }
    },
    plugins: [svgRawPlugin]
  },
  preload: {},
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [tailwindcss(), react(), svgr()]
  }
})
