import { defineConfig, loadEnv } from 'vite';
import { visualizer } from 'rollup-plugin-visualizer';
// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '../', '');

  return {
    base: '/ui/',
    define: {
      'import.meta.env.VITE_TITLE': JSON.stringify(env.TITLE),
      'import.meta.env.VITE_SUPER_USER_EMAIL': JSON.stringify(env.SUPER_USER_EMAIL),
    },
    build: {
      outDir: '../nginx/html/ui',
      emptyOutDir: true,
      /* */
      minify: false,
      terserOptions: {
        compress: false,
        mangle: false,
      },
      /* */
      // Remove lib configuration to build a complete web app instead of a library
      rollupOptions: {
        input: {
          main: 'index.html',
        },
      },
    },
    plugins: [
      visualizer({ open: true }), // Automatically opens the visualizer in your browser
    ],
  };
});
