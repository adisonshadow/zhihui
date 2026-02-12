/**
 * AI 模型服务 - 独立 Node 构建
 * 输出纯 Node 可执行脚本，无 Electron，无 Dock 图标
 */
import path from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist-electron/ai-server',
    emptyOutDir: false,
    lib: {
      entry: path.resolve(__dirname, 'electron/ai-model-service/standalone.ts'),
      formats: ['es'],
      fileName: () => 'index.js',
    },
    rollupOptions: {
      external: ['onnxruntime-node', 'sharp', 'node:http', 'node:path', 'node:fs', 'node:url'],
      output: {
        format: 'esm',
        inlineDynamicImports: true,
      },
    },
    sourcemap: true,
    minify: false,
  },
});
