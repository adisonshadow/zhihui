/**
 * 开发模式：为 samples/ 启动内嵌 Strudel 采样 HTTP 服务（默认 :5432）
 */
import path from 'node:path';
import type { Plugin } from 'vite';
import { startStrudelSampleServer, strudelSampleServerUrl } from '../electron/main/strudelSampleServer';

const PORT = Number(process.env.STRUDEL_SAMPLES_PORT ?? '5432');

export function strudelSamplerDevPlugin(): Plugin {
  return {
    name: 'strudel-sampler-dev',
    configureServer() {
      const samplesDir = path.resolve(process.cwd(), 'samples');
      startStrudelSampleServer(samplesDir, { port: PORT });
      console.log(`[strudel-sampler] dev 请求 ${strudelSampleServerUrl()}`);
    },
  };
}
