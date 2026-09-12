import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig(({ mode }) => {
  const isProd = mode === 'production'

  return {
    plugins: [react()],

    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },

    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true,
        },
      },
    },

    build: {
      // ── Anti reverse-engineering ─────────────────────────────────
      // Disable source maps in production — compiled code cannot be
      // mapped back to the original TypeScript source.
      sourcemap: isProd ? false : 'inline',

      // Minify with terser for stronger obfuscation
      minify: isProd ? 'terser' : false,

      terserOptions: isProd ? {
        compress: {
          // Remove all console.* calls (prevents info leakage in DevTools)
          drop_console: true,
          drop_debugger: true,
          // Collapse constant values — harder to trace logic
          collapse_vars: true,
          // Remove unreachable code
          dead_code: true,
          // Inline small functions — makes call graph harder to follow
          inline: 2,
        },
        mangle: {
          // Mangle top-level identifiers — function/class names become a,b,c...
          toplevel: true,
          // Do NOT mangle property names (would break JSON key access)
          properties: false,
        },
        format: {
          // Strip all comments (removes version strings, hints)
          comments: false,
        },
      } : undefined,

      // Chunk splitting with hashed filenames (prevents URL guessing)
      rollupOptions: {
        output: {
          entryFileNames:   'assets/[name]-[hash].js',
          chunkFileNames:   'assets/[name]-[hash].js',
          assetFileNames:   'assets/[name]-[hash][extname]',
          manualChunks: {
            'vendor-react':  ['react', 'react-dom', 'react-router-dom'],
            'vendor-ui':     ['lucide-react'],
            'vendor-charts': ['recharts'],
          },
        },
      },

      // FIX (PageSpeed, Sep 2026): Vite inyecta <link rel="modulepreload"> en
      // index.html para TODOS los manualChunks del entry, sin importar si la
      // ruta actual los necesita. vendor-charts (recharts, ~380KB decoded)
      // solo lo usan Dashboard/Reportes (rutas lazy), pero se precargaba y
      // ejecutaba en CADA visita, incluida la landing pública -- costaba
      // ~1.4s de Total Blocking Time en el análisis mobile de PageSpeed.
      // Se excluye del preload de cada entry; las rutas que sí lo necesitan
      // lo siguen cargando normalmente vía su import() dinámico.
      modulePreload: {
        resolveDependencies: (_filename, deps) => deps.filter(dep => !dep.includes('vendor-charts')),
      },

      chunkSizeWarningLimit: 800,
    },
  }
})
