import { useMemo } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { basicDark } from '@uiw/codemirror-theme-basic';
import { vscodeDark } from '@uiw/codemirror-theme-vscode';
import { keymap, EditorView } from '@codemirror/view';

/** 对比主题：改 `.basicDark` / `.vscodeDark` 即可 */
const THEMES = { basicDark, vscodeDark } as const;
const editorTheme = THEMES.basicDark;
// const editorTheme = THEMES.vscodeDark;

export interface TidalCodeEditorProps {
  value: string;
  onChange: (next: string) => void;
  readOnly?: boolean;
  onRun?: () => void;
  /** CodeMirror height CSS，默认占满可读区域 */
  height?: string;
}

/**
 * Strudel 代码编辑器（JS 语法高亮 + 暗色主题，匹配 Ant Design dark）。
 */
export function TidalCodeEditor({
  value,
  onChange,
  readOnly,
  onRun,
  height = 'min(560px, calc(100vh - 220px))',
}: TidalCodeEditorProps) {
  const extensions = useMemo(() => {
    const runKeymap = keymap.of([
      {
        key: 'Mod-Enter',
        run: () => {
          onRun?.();
          return true;
        },
      },
    ]);
    return [
      javascript({ jsx: false, typescript: false }),
      // vscodeDark,
      // basicDark,
      runKeymap,
      EditorView.lineWrapping,
    ];
  }, [onRun]);

  return (
    <CodeMirror
      value={value}
      height={height}
      theme={editorTheme}
      // theme={vscodeDark}
      // theme={basicDark}
      extensions={extensions}
      editable={!readOnly}
      onChange={onChange}
      basicSetup={{
        lineNumbers: true,
        foldGutter: true,
        highlightActiveLine: true,
        /** basicSetup 默认 defaultHighlightStyle 会盖掉 @uiw 主题语法色 */
        syntaxHighlighting: false,
      }}
      style={{
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 8,
        overflow: 'hidden',
        flex: 1,
        minHeight: 0,
      }}
    />
  );
}
