import type { FormInstance } from 'antd/es/form';
import { splitLegacyModelId } from '@/utils/aiModelRequestId';

/** 从输入框原始字符串解析「模型名段-6位以上版本号」，用于粘贴完整 model id 时拆分 */
export function splitDisplayInputTrailingVersion(raw: string): {
  modelDisplayName: string;
  primaryVersion: string;
} {
  return splitLegacyModelId(raw.trim());
}

/**
 * 若整段形如 `xxx-250615`，则写回表单为 DisplayName=xxx、PrimaryVersion=250615
 * @returns 是否发生了拆分写入
 */
export function applyDisplayNameVersionSplitToForm(
  form: FormInstance,
  rawFromInput: string,
  fieldDisplay = 'modelDisplayName',
  fieldVersion = 'primaryVersion',
): boolean {
  const trimmed = rawFromInput.trim();
  if (!trimmed) return false;
  const { modelDisplayName, primaryVersion } = splitDisplayInputTrailingVersion(trimmed);
  if (!primaryVersion || modelDisplayName === trimmed) return false;
  form.setFieldsValue({
    [fieldDisplay]: modelDisplayName,
    [fieldVersion]: primaryVersion,
  });
  return true;
}
