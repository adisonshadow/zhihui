import { rmSync } from 'node:fs';
import path from 'node:path';
import { defineConfig, build } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron/simple';

// https://vitejs.dev/config/
export default defineConfig(({ command }) => {
  try {
    rmSync('dist-electron', { recursive: true, force: true });
  } catch {
    /* 目录可能被占用，忽略 */
  }

  const isBuild = command === 'build';
  const sourcemap = !isBuild || !!process.env.VSCODE_DEBUG;

  return {
    server: {
      port: 5173,
      host: '127.0.0.1', // 显式绑定，避免 localhost 解析问题
    },
    resolve: {
      alias: {
        '@': path.join(__dirname, 'src'),
      },
    },
    plugins: [
      react(),
      electron({
        main: {
          entry: 'electron/main/index.ts',
          onstart(args) {
            if (process.env.VSCODE_DEBUG) {
              console.log('[startup] Electron App');
            } else {
              args.startup();
            }
          },
          vite: {
            plugins: [
              {
                name: 'build-ai-server',
                async closeBundle() {
                  await build({ configFile: 'vite.ai-server.config.ts' }).catch((e) =>
                    console.warn('[build-ai-server]', e)
                  );
                },
              },
            ],
            build: {
              sourcemap,
              minify: isBuild,
              outDir: 'dist-electron/main',
              rollupOptions: {
                external: ['electron', 'better-sqlite3', 'node:fs', 'node:path', 'node:url', 'node:http', 'ffmpeg-static', 'sharp', 'fluent-ffmpeg'],
              },
            },
          },
        },
        preload: {
          input: 'electron/preload/index.ts',
          vite: {
            build: {
              sourcemap: sourcemap ? 'inline' : undefined,
              minify: isBuild,
              outDir: 'dist-electron/preload',
              rollupOptions: {
                output: {
                  format: 'cjs',
                  entryFileNames: 'index.cjs',
                },
              },
            },
          },
        },
        renderer: {},
      }),
    ],
    clearScreen: false,
  };
});
