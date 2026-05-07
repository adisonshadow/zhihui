import type { XAgentCommand_v0_9 } from '@ant-design/x-card';
import { NOVEL_EDITOR_TOOL_CATALOG_ID } from './registerNovelEditorToolCatalog';

type NovelToolUiNode = {
  id: string;
  component: string;
  child?: string;
  children?: string[];
  [key: string]: unknown;
};

const PREVIEW_CHARS = 2000;

function truncateField(s: string, max = PREVIEW_CHARS): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}\n…（已截断）`;
}

/** 将 novel_* 工具返回的 JSON 对象编成单条 Surface 的 v0.9 命令 */
export function buildNovelEditorToolSurfaceCommands(
  surfaceId: string,
  data: Record<string, unknown>,
  options?: { toolName?: string }
): XAgentCommand_v0_9[] {
  const ok = data.ok === true;
  const phase = String(data.phase ?? '');
  const isWritingPhase = phase === 'writing';
  const tone =
    isWritingPhase ? 'neutral'
    : ok ? 'success'
    : 'error';
  const isWriteResult = typeof data.summary === 'string' && typeof data.content_length === 'number';
  const tn = options?.toolName?.trim();
  const toolSuffix = tn ? ` · ${tn}` : '';
  const titleText =
    isWritingPhase ? `正在生成文档...${toolSuffix}`
    : ok && isWriteResult ? `正文已写入编辑器${toolSuffix}`
    : ok ? `工具结果${toolSuffix}`
    : `工具未成功${toolSuffix}`;

  const comps: NovelToolUiNode[] = [];
  const rootChildren: string[] = ['nt_title'];

  comps.push({
    id: 'nt_title',
    component: 'NovelToolTitle',
    text: titleText,
    tone,
  });

  const addField = (id: string, label: string, body: string) => {
    if (!body.trim()) return;
    rootChildren.push(id);
    comps.push({ id, component: 'NovelToolField', label, body: truncateField(body) });
  };

  const addMarkdownBodyField = (id: string, label: string, body: string) => {
    if (!body.trim()) return;
    rootChildren.push(id);
    comps.push({
      id,
      component: 'NovelToolCollapsibleField',
      label,
      body: truncateField(body),
      defaultCollapsed: true,
    });
  };

  if (typeof data.error === 'string' && data.error.trim()) {
    addField('nt_err', '说明', data.error);
  }

  if (typeof data.episode_id === 'string') addField('nt_ep', 'episode_id', data.episode_id);
  if (typeof data.episode === 'number') addField('nt_en', '集序号 episode', String(data.episode));
  if (typeof data.title === 'string') addField('nt_ti', '标题', data.title);
  if (typeof data.title_in_editor === 'string') addField('nt_ti_ed', '编辑器标题', data.title_in_editor);
  if (typeof data.nav_label === 'string') addField('nt_nav', '侧栏展示', data.nav_label);
  if (typeof data.content_length === 'number') addField('nt_len', '正文字数', String(data.content_length));
  if (typeof data.created_time === 'string') addField('nt_ct', '创建时间', data.created_time);
  if (typeof data.summary === 'string') addField('nt_summary', '说明', data.summary);

  if (typeof data.content_markdown === 'string') {
    addMarkdownBodyField('nt_md', '正文', data.content_markdown);
  }

  if (Array.isArray(data.episodes)) {
    try {
      const lines = (data.episodes as unknown[]).map((e, i) => {
        if (e && typeof e === 'object') {
          const o = e as Record<string, unknown>;
          return `${i + 1}. episode=${String(o.episode ?? '—')}\t${String(o.nav_label ?? o.title ?? '')}\tid=${String(o.id ?? '')}`;
        }
        return `${i + 1}. ${String(e)}`;
      });
      addField('nt_ls', '章节列表', lines.join('\n'));
    } catch {
      addField('nt_ls', '章节列表', truncateField(JSON.stringify(data.episodes)));
    }
  }

  const restKeys = Object.keys(data).filter(
    (k) =>
      ![
        'ok',
        'error',
        'episode_id',
        'title',
        'title_in_editor',
        'nav_label',
        'episode',
        'content_markdown',
        'content_length',
        'created_time',
        'summary',
        'phase',
        'episodes',
      ].includes(k)
  );
  for (const k of restKeys) {
    const v = data[k];
    const s = typeof v === 'string' ? v : JSON.stringify(v);
    addField(`nt_x_${k}`, k, s);
  }

  comps.push({
    id: 'root',
    component: 'NovelToolColumn',
    gap: 10,
    children: rootChildren,
  });

  return [
    { version: 'v0.9', createSurface: { surfaceId, catalogId: NOVEL_EDITOR_TOOL_CATALOG_ID } },
    { version: 'v0.9', updateComponents: { surfaceId, components: comps } },
    { version: 'v0.9', updateDataModel: { surfaceId, path: '/', value: {} } },
  ];
}
