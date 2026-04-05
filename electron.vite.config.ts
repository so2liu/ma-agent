import { resolve } from 'path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    define: {
      __PARSE_SERVER_URL__: JSON.stringify(
        process.env.PARSE_SERVER_URL || 'https://ma-agent.yangl.com.cn'
      ),
      __HMAC_SECRET__: JSON.stringify(
        process.env.HMAC_SECRET || 'kfy7-1oO-1oo-OcQ-XxG-t9W-odp-LSm'
      ),
      __SENTRY_DSN__: JSON.stringify(process.env.SENTRY_DSN ?? 'https://6aff2eef33fba18fbddd7f825c861028@o4506850555002880.ingest.us.sentry.io/4511167785992192')
    },
    build: {
      outDir: 'out/main',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts')
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/preload',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts')
        },
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs'
        }
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    base: './',
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src/renderer')
      }
    },
    plugins: [react(), tailwindcss()],
    build: {
      outDir: resolve(__dirname, 'out/renderer'),
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html')
        }
      }
    }
  }
});
