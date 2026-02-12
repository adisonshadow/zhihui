/**
 * AI 模型服务 - 统一入口
 */
export { runMatting, getMattingAdapter, listMattingModels } from './registry';
export type { MattingInput, MattingOutput, MattingResult, MattingAdapter } from './types';
export { MattingErrorCode, mattingError } from './types';
