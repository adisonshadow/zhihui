/**
 * 内置原子 Tool 注册入口
 *
 * 在应用启动时调用 registerAllBuiltInTools() 注册所有 orchestrator-scope 的原子 Tool。
 */
import { registerGenerateImagesTool } from './generate_images';
import { registerGenerateVideoTool } from './generate_video';
import { registerGenerateTextTool } from './generateText';
import { registerUpdateDataTool } from './updateData';

let registered = false;

/** 注册所有内置原子 Tool（幂等调用） */
export function registerAllBuiltInTools(): void {
  if (registered) return;
  registered = true;

  registerGenerateImagesTool();
  registerGenerateVideoTool();
  registerGenerateTextTool();
  registerUpdateDataTool();

  console.log('[builtInTools] 已注册所有原子 Tool');
}
