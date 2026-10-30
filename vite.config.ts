import { renameSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

/** Name the single-file build something worth sharing instead of index.html. */
function renameOutput(name: string): Plugin {
  return {
    name: 'rename-output',
    apply: 'build',
    closeBundle() {
      renameSync('dist/index.html', `dist/${name}`)
    },
  }
}

export default defineConfig(({ mode }) => ({
  // docs/ (guides and screenshots) is never part of the app: don't scan it for
  // dependencies or reload the dev server when it changes.
  optimizeDeps: { entries: ['index.html'] },
  server: { port: 5173, watch: { ignored: ['**/docs/**'] } },
  build: {
    // Keep the other build's file when building one of the two variants.
    emptyOutDir: false,
  },
  // Everything, fonts included, is inlined into one HTML file that opens
  // straight from disk with no server or Node.js. `--mode public` leaves out
  // src/fonts-private so the file is safe to share.
  plugins: [viteSingleFile(), renameOutput(mode === 'public' ? 'glyphcraft-public.html' : 'glyphcraft.html')],
}))
