/**
 * 小说编写区：基于 @milkdown/crepe 的所见即所得 Markdown 编辑（Floating Toolbar 等与 Crepe 一致）
 */
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { editorViewCtx, parserCtx } from '@milkdown/kit/core';
import { Crepe, CrepeFeature } from '@milkdown/crepe';
import { Milkdown, MilkdownProvider, useEditor, useInstance } from '@milkdown/react';

/* nord-dark 仅含色板变量；common 含 toolbar / slash 菜单等结构样式与 [data-show=false] 隐藏规则 */
import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/nord-dark.css';

export interface NovelCrepeEditorProps {
  /** 外层 MilkdownProvider 的 key（切换集 / 外部覆盖正文时变更） */
  providerKey: string;
  initialMarkdown: string;
  readOnly?: boolean;
  onMarkdownChange?: (markdown: string) => void;
  /** 非空选区时的纯文本 */
  onSelectionPlain?: (plain: string) => void;
}

export type NovelCrepeEditorHandle = {
  /** 将焦点交回 ProseMirror（侧栏 Sender 更新 slot 后会抢焦点时使用） */
  focusEditor: () => void;
};

const NovelCrepeEditorInner = forwardRef<
  NovelCrepeEditorHandle,
  Omit<NovelCrepeEditorProps, 'providerKey'>
>(function NovelCrepeEditorInner({
  initialMarkdown,
  readOnly,
  onMarkdownChange,
  onSelectionPlain,
}, ref) {
  const onMarkdownChangeRef = useRef(onMarkdownChange);
  onMarkdownChangeRef.current = onMarkdownChange;
  const onSelectionPlainRef = useRef(onSelectionPlain);
  onSelectionPlainRef.current = onSelectionPlain;
  const readOnlyRef = useRef(!!readOnly);
  readOnlyRef.current = !!readOnly;
  const lastSetMdRef = useRef(initialMarkdown);

  /* MilkdownProvider key 切换集/外部覆盖时再挂载；factory 仅用首次 initialMarkdown */
  useEditor((root) => {
    const crepe = new Crepe({
      root,
      defaultValue: initialMarkdown,
      features: {
        [CrepeFeature.Cursor]: true,
        [CrepeFeature.ListItem]: true,
        [CrepeFeature.LinkTooltip]: true,
        [CrepeFeature.ImageBlock]: true,
        [CrepeFeature.BlockEdit]: true,
        [CrepeFeature.Toolbar]: true,
        [CrepeFeature.Placeholder]: true,
        [CrepeFeature.Table]: true,
        [CrepeFeature.Latex]: true,
        [CrepeFeature.TopBar]: false,
        [CrepeFeature.CodeMirror]: true,
      },
      featureConfigs: {
        [CrepeFeature.Placeholder]: {
          text: '在这里创作…',
        },
      },
    });
    crepe.setReadonly(readOnlyRef.current);
    crepe.on((listener) => {
      listener.markdownUpdated((_ctx, md, prev) => {
        if (readOnlyRef.current) return;
        if (md === prev) return;
        onMarkdownChangeRef.current?.(md);
      });
      listener.selectionUpdated((ctx, selection) => {
        const fn = onSelectionPlainRef.current;
        if (!fn) return;
        const view = ctx.get(editorViewCtx);
        let text = '';
        try {
          if (!selection.empty) {
            text = view.state.doc.textBetween(selection.from, selection.to, '\n').trim();
          }
        } catch {
          text = '';
        }
        fn(text);
      });
    });
    return crepe;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 依赖外层 providerKey / remountVersion
  }, []);

  const [loading, getInstance] = useInstance();

  useImperativeHandle(
    ref,
    () => ({
      focusEditor: () => {
        const ed = getInstance();
        if (!ed) return;
        try {
          ed.action((ctx) => {
            ctx.get(editorViewCtx).focus();
          });
        } catch {
          /* noop */
        }
      },
    }),
    [getInstance]
  );

  useEffect(() => {
    if (loading) return;
    const ed = getInstance();
    if (!ed) return;
    ed.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      view.setProps({ editable: () => !readOnly });
    });
  }, [loading, readOnly, getInstance]);

  useEffect(() => {
    if (loading) return;
    const ed = getInstance();
    if (!ed) return;
    const trimmed = initialMarkdown.trim();
    if (trimmed === lastSetMdRef.current?.trim()) return;
    lastSetMdRef.current = initialMarkdown;
    ed.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const parser = ctx.get(parserCtx);
      const doc = parser(initialMarkdown);
      if (!doc) return;
      const tr = view.state.tr.replaceWith(0, view.state.doc.content.size, doc);
      view.dispatch(tr);
    });
  }, [loading, initialMarkdown, getInstance]);

  return <Milkdown />;
});

export const NovelCrepeEditor = forwardRef<NovelCrepeEditorHandle, NovelCrepeEditorProps>(
  function NovelCrepeEditor({ providerKey, ...rest }, ref) {
    return (
      <MilkdownProvider key={providerKey}>
        <div className="novel-crepe-editor-root" style={{ height: '100%', minHeight: 0, overflow: 'auto' }}>
          <NovelCrepeEditorInner {...rest} ref={ref} />
        </div>
      </MilkdownProvider>
    );
  }
);
