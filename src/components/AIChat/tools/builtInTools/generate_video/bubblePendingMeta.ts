export type GenerateVideoToolCallRow = {
  id?: string;
  name?: string;
  arguments?: string;
};

/** generate_video 只允许单条生成；占位固定为 1 段 */
export function computePendingGenerateVideoBubbleExtra(args: {
  role: string;
  toolCallsRaw: GenerateVideoToolCallRow[];
  answeredToolCallIds: Set<string>;
}): { pendingGenerateVideo?: boolean } {
  const { role, toolCallsRaw, answeredToolCallIds } = args;
  if (role !== 'assistant' || !toolCallsRaw.length) return {};

  const pend = toolCallsRaw.filter(
    (t) =>
      t?.name === 'generate_video' &&
      String(t?.id ?? '').trim() !== '' &&
      !answeredToolCallIds.has(String(t.id).trim()),
  );

  return pend.length ? { pendingGenerateVideo: true } : {};
}
