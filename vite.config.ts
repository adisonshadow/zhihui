import { rmSync } from 'node:fs';
import path from 'node:path';
import { defineConfig, build } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron/simple';
import { volcTosDevFetchPlugin } from './vite-plugins/volcTosDevFetch';
import { strudelSamplerDevPlugin } from './vite-plugins/strudelSamplerDev';

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
    define: {
      __VUE_OPTIONS_API__: false,
      __VUE_PROD_DEVTOOLS__: false,
      __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false,
    },
    server: {
      port: 5173,
      host: '127.0.0.1', // 显式绑定，避免 localhost 解析问题
    },
    resolve: {
      alias: {
        '@': path.join(__dirname, 'src'),
      },
      // CodeMirror 核心包须单实例，否则主题/语法扩展的 facet 与编辑器视图不匹配，
      // 会导致 @uiw 主题（basicDark / vscodeDark）静默失效、行号区回退为默认 light。
      dedupe: [
        '@codemirror/state',
        '@codemirror/view',
        '@codemirror/language',
        '@codemirror/commands',
        '@codemirror/autocomplete',
        '@codemirror/search',
        '@codemirror/lint',
        '@lezer/common',
        '@lezer/highlight',
      ],
    },
    plugins: [
      react(),
      ...(command === 'serve' ? [volcTosDevFetchPlugin(), strudelSamplerDevPlugin()] : []),
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
                external: [
                  'electron',
                  'better-sqlite3',
                  'ws',
                  'bufferutil',
                  'utf-8-validate',
                  'node:fs',
                  'node:path',
                  'node:url',
                  'node:http',
                  'node:os',
                  'node:child_process',
                  'node:crypto',
                  'ffmpeg-static',
                  'sharp',
                  'fluent-ffmpeg',
                  'font-list',
                ],
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
