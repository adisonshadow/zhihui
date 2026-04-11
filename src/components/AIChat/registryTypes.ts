/**
 * 宿主侧注册类型（业务外置）。
 * 见 docs/06 §13
 */
import type { SlotConfigType } from '@ant-design/x/lib/sender/interface';

/** 提示词模版内 slot 声明（语义化 id + 默认值） */
export interface PromptTemplateSlotDef {
  id: string;
  defaultFulltext?: string;
  defaultLabel?: string;
}

/** 语义化唯一 id 的提示词模版；body 支持 {{slot:slotId}} */
export interface PromptTemplateDef {
  id: string;
  /** 限定仅某 Agent 可选用；省略表示不限制 */
  agentKey?: string;
  body: string;
  slots?: PromptTemplateSlotDef[];
}

/** 与 Ant Design X Sender 对齐的可注册槽位 */
export interface RegisterableSenderSlot {
  id: string;
  slot: SlotConfigType;
}

/** applyPromptTemplate 传入的 slot 值：提交用 fulltext，展示用 label */
export interface TemplateSlotValue {
  slotId: string;
  label: string;
  fulltext: string;
}

/**
 * 将模版 body 中 {{slot:id}} 替换为 fulltext。
 * 未在 values 中出现的占位尝试使用 slots[].defaultFulltext。
 */
export function renderPromptTemplate(
  template: PromptTemplateDef,
  values: TemplateSlotValue[]
): { fulltext: string; displayLabel: string } {
  const map = new Map(values.map((v) => [v.slotId, v]));
  let body = template.body;
  for (const s of template.slots ?? []) {
    const v = map.get(s.id);
    const text = v?.fulltext ?? s.defaultFulltext ?? '';
    body = body.split(`{{slot:${s.id}}}`).join(text);
  }
  body = body.replace(/\{\{slot:([^}]+)\}\}/g, (_, rawId: string) => {
    const id = String(rawId).trim();
    const v = map.get(id);
    if (v) return v.fulltext;
    const def = template.slots?.find((s) => s.id === id);
    return def?.defaultFulltext ?? '';
  });
  const displayLabel =
    values.length > 0 ? values.map((v) => v.label).join(' · ') : template.id;
  return { fulltext: body, displayLabel };
}
