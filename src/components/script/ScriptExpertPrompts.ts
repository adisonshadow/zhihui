/**
 * 剧本专家常用提示词（参考 Aisting oneClickAnalysis）
 */
export interface ScriptPromptItem {
  key: string;
  label: string;
  message: string;
}

export const SCRIPT_PROMPTS: ScriptPromptItem[] = [
  { key: 'expand-summary', label: '扩写概要', message: '请根据当前概要扩写更详细的剧情描述' },
  { key: 'expand-script', label: '扩写剧本', message: '请根据当前剧本扩写更详细的剧本文本' },
  { key: 'condense-summary', label: '缩写概要', message: '请将当前概要缩写为更简洁的版本' },
  { key: 'condense-script', label: '缩写剧本', message: '请将当前剧本文本缩写为更简洁的版本' },
  { key: 'polish-summary', label: '润色概要', message: '请润色当前概要，提升文采和可读性' },
  { key: 'polish-script', label: '润色剧本', message: '请润色当前剧本文本，提升文采和可读性' },
  { key: 'add-conflict', label: '增加冲突', message: '请在剧情中增加戏剧冲突，让故事更有张力' },
  { key: 'add-dialogue', label: '补充对白', message: '请为当前场景补充更丰富的角色对白' },
  { key: 'suggest-scenes', label: '建议场景', message: '请根据当前剧情建议可增加的场景' },
];
