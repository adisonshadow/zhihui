import { Flex } from 'antd';
import { prettifyAssistantJsonFenceDump } from '../utils/screenwriterStoryPayload';

/** 流式 / 未完成解析时：等宽展示 JSON（多段围栏逐段排版），尽量缩进（可解析时） */
export function ScreenwriterDrawJsonStream({ raw }: { raw: string }) {
  const pretty = prettifyAssistantJsonFenceDump(raw);
  return (
    <Flex vertical gap={8} style={{ width: '100%' }}>
      <pre className="screenwriter-draw-json-stream">{pretty}</pre>
    </Flex>
  );
}
