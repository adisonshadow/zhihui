/**
 * 仅 Web 模式：用于排查 Vite 开发服务器是否可用
 * 运行: npx vite --config vite.config.web.ts
 * 若 http://127.0.0.1:5173 能打开，则问题在 electron 插件；否则问题在 Vite/网络/系统
 */
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  server: {
    port: 5173,
    host: '127.0.0.1',
  },
  resolve: {
    alias: { '@': path.join(__dirname, 'src') },
  },
  plugins: [react()],
});
