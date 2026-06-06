/**
 * generate_images Tool 模块入口：注册与其它子模块的出口
 *
 * - `handler.ts`：OpenAI Images API 调用与 `registerFunctionCall`
 * - `generateImagesChatUi.tsx`：对话占位 + tool 气泡结果
 */
export { registerGenerateImagesTool } from './handler';
