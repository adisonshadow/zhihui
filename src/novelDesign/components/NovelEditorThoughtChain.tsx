/**
 * 小说编写工具链展示：用 ThoughtChain 可视化 AI 的工具调用过程
 */
import { useMemo } from 'react';
import { Flex, Tag } from 'antd';
import { ThoughtChain } from '@ant-design/x';
import type { ThoughtChainItemType } from '@ant-design/x';

const TOOL_CHINESE_MAP: Record<string, string> = {
  novel_list_episodes: '列出章节',
  novel_create_episode_and_open: '新建集并打开',
  novel_get_episode: '读取正文',
  novel_body_episode_exists: '查第N集',
  novel_open_body_episode: '打开第N集',
  novel_write_body_episode: '写第N集',
  novel_create_episode: '新建集',
  novel_rename_episode: '重命名集',
  novel_reorder_episode: '调整顺序',
  novel_delete_episode: '删除集',
  novel_delete_body_episode_range: '删除集范围',
  novel_split_episode: '拆分集',
  novel_merge_episodes: '合并集',
  novel_replace_content: '替换片段',
  novel_delete_segment: '删除片段',
  novel_write_episode: '写入正文',
  novel_update_outline: '更新大纲',
  novel_rename_novel: '改书名',
  novel_get_story_outline: '读取故事大纲',
  novel_cover_generate_or_apply: '封面出图/落盘',
};

function chineseLabel(name: string): string {
  return TOOL_CHINESE_MAP[name] ?? name;
}

function parseToolResult(raw: string): { ok: boolean | null; summary: string } | null {
  const s = raw.trim();
  if (!s.startsWith('{')) return null;
  try {
    const o = JSON.parse(s) as Record<string, unknown>;
    if (o && typeof o === 'object' && 'ok' in o) {
      const ok = o.ok === true;
      const error = typeof o.error === 'string' ? o.error.trim() : '';
      const summary = typeof o.summary === 'string' ? o.summary.trim() : '';
      let desc = summary;
      if (!desc && error) desc = error;
      if (!desc && typeof o.deleted_count === 'number') desc = `已删除 ${o.deleted_count} 集`;
      if (!desc && typeof o.replacements === 'number') desc = `已替换 ${o.replacements} 处`;
      if (!desc && typeof o.title === 'string') desc = `标题: ${o.title}`;
      if (!desc && typeof o.nav_label === 'string') desc = o.nav_label;
      if (!desc && Array.isArray(o.episodes)) desc = `共 ${o.episodes.length} 集`;
      if (!desc && ok) desc = '完成';
      if (!desc) desc = error || '失败';
      return { ok, summary: desc };
    }
    return null;
  } catch {
    return null;
  }
}

export interface NovelEditorThoughtChainProps {
  toolCallNames: string[];
  toolResultContents: string[];
  streaming?: boolean;
}

export function NovelEditorThoughtChain({
  toolCallNames,
  toolResultContents,
  streaming,
}: NovelEditorThoughtChainProps) {
  const items: ThoughtChainItemType[] = useMemo(() => {
    const result: ThoughtChainItemType[] = [];

    for (let i = 0; i < toolCallNames.length; i++) {
      const name = toolCallNames[i] ?? '';
      const label = chineseLabel(name);
      const rawContent = toolResultContents[i] ?? '';
      const parsed = parseToolResult(rawContent);
      const pending = !rawContent || streaming;

      let status: ThoughtChainItemType['status'];
      if (pending) {
        status = 'loading';
      } else if (parsed?.ok === true) {
        status = 'success';
      } else {
        status = 'error';
      }

      const description = parsed?.summary || (pending ? '处理中…' : label);

      result.push({
        key: `${name}_${i}`,
        title: label,
        description,
        status,
      });
    }

    return result;
  }, [toolCallNames, toolResultContents, streaming]);

  if (items.length === 0) return null;

  return (
    <Flex vertical gap={8} style={{ width: '100%' }}>
      {toolCallNames.length > 1 && (
        <Tag color="processing" style={{ alignSelf: 'flex-start', fontSize: 11 }}>
          AI 工具调用
        </Tag>
      )}
      <ThoughtChain
        items={items}
        style={{ width: '100%' }}
      />
    </Flex>
  );
}
