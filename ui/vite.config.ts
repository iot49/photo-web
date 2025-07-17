import { defineConfig, loadEnv } from 'vite'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '../', '')

  return {
    base: '/ui/',
    define: {
      'import.meta.env.VITE_TITLE': JSON.stringify(env.TITLE)
    },
    build: {
      outDir: '../nginx/html/ui',
      emptyOutDir: true,
      // Remove lib configuration to build a complete web app instead of a library
      rollupOptions: {
        input: {
          main: 'index.html'
        }
      }
    }
  }
})

