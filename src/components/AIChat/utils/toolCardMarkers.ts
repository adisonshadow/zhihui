const PREFIX = 'YIMAN_TOOL_CARD__';

export function isToolCardContent(content: string | undefined | null): boolean {
  return typeof content === 'string' && content.startsWith(PREFIX);
}

export function getToolCardIdFromContent(content: string): string | null {
  if (!isToolCardContent(content)) return null;
  return content.slice(PREFIX.length);
}

export function makeToolCardAssistantContent(toolId: string): string {
  return `${PREFIX}${toolId}`;
}
