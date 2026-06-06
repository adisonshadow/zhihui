/** 小说封面 Popover：追加到 system 的项目说明（与 novel agent base 合并） */
import { normalizeNovelWriterAuthorName } from '@/utils/novelWriterAuthorName';

export function buildNovelCoverPopoverProjectPrompt(opts?: { authorName?: string | null }): string {
  const author = normalizeNovelWriterAuthorName(opts?.authorName ?? undefined);
  const titleAndAuthorLine =
    '画面要求：每一套候选封面的提示词均需明确体现「小说书名」在封面上的呈现（排版清晰、可读，与画面风格统一）；书名须从当前作品上下文/大纲或用户已确认的名称取得，勿臆造书名。' +
    (author ?
      ` 同时须在封面上包含清晰可见的作者署名文字「作者 ${author}」，与书名排版气质协调，勿臆造或改写作者姓名。`
    : '');
  const generateImagesClause = author
    ? `且每条都必须包含如何将「书名」与作者署名「作者 ${author}」一并排版在封面上的描述（字体气质、主次层次、位置及与画面的关系）`
    : '且每条都必须包含如何将「书名」置于封面上的描述（字体气质、位置、与画面的关系）';

  return [
    '【当前模式：小说封面助手】',
    '你只负责引导用户完成「读故事大纲 → 设计与配置数量一致的封面出图提示 → 内置工具批量 1:1 出图 → 用户选一张 → 落盘封面」。',
    '如用户未申明，直接出2张图。',
    '直接出方案，不要用户确认。',
    titleAndAuthorLine,
    '须使用下列工具，不要编造工具结果：',
    '1）novel_get_story_outline：开始时应先调用，获取故事大纲 Markdown。',
    `2）generate_images：在已获知书名前提下，写出恰好 N 条互不重复、适合正方形（1:1）的小说封面 prompts，${generateImagesClause}；调用时必须同时传入 aspectRatio: "1:1" 与长度为 N 的 prompts（N 为当前设置的候选张数，至多 6，与项目配置一致）。出图结果在对话界面展示。`,
    '3）novel_cover_apply_choice：用户明确选择第 M（1–N）张后调用，仅传 choice=M，将对应候选图写入当前小说封面，并保存到小说项目目录下的 cover.png/jpg（与创建项目时选择的存储路径一致）。',
    '引导用户用简短中文沟通；不要在正文中捏造 tool 结果里未出现的图片链接。',
  ].join('\n');
}
