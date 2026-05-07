/**
 * novel_* 函数 tool 消息的 A2UI 展示（v0.9 Box + Card）
 */
import { useMemo } from 'react';
import { Box, Card } from '@ant-design/x-card';

import '@/novelDesign/a2ui/registerNovelEditorToolCatalog';
import { buildNovelEditorToolSurfaceCommands } from '@/novelDesign/a2ui/buildNovelEditorToolCommands';
import { NOVEL_EDITOR_TOOL_UI_COMPONENT_MAP } from '@/novelDesign/a2ui/NovelEditorToolA2uiComponents';

function tryParseToolJson(raw: string): Record<string, unknown> | null {
  const s = raw.trim();
  if (!s.startsWith('{')) return null;
  try {
    const o = JSON.parse(s) as unknown;
    if (o && typeof o === 'object' && !Array.isArray(o) && 'ok' in (o as object)) {
      return o as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

export interface NovelEditorToolA2uiBubbleProps {
  raw: string;
  /** 对应 function name（如 novel_list_episodes），由 tool 气泡侧传入 */
  toolName?: string;
}

export function NovelEditorToolA2uiBubble({ raw, toolName }: NovelEditorToolA2uiBubbleProps) {
  const parsed = tryParseToolJson(raw);

  const surfaceId = useMemo(() => {
    const slug = parsed ? String(parsed.episode_id ?? parsed.title ?? '').slice(0, 48) : '';
    const h = raw.length;
    return `novel-tool_${slug.replace(/[^\w\-]+/g, '_') || 'anon'}_${h}`;
  }, [parsed, raw]);

  const commands = useMemo(() => {
    if (!parsed) return [];
    return buildNovelEditorToolSurfaceCommands(surfaceId, parsed, { toolName });
  }, [parsed, surfaceId, toolName]);

  if (!parsed || commands.length === 0) {
    return (
      <pre
        style={{
          margin: 0,
          fontSize: 12,
          color: 'rgba(255,255,255,0.65)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {raw}
      </pre>
    );
  }

  return (
    <Box commands={commands} components={NOVEL_EDITOR_TOOL_UI_COMPONENT_MAP}>
      <div
        style={{
          borderRadius: 10,
          border: '1px solid rgba(255,255,255,0.1)',
          background: 'rgba(255,255,255,0.04)',
          padding: '10px 12px',
          maxWidth: '100%',
        }}
      >
        <Card id={surfaceId} />
      </div>
    </Box>
  );
}
