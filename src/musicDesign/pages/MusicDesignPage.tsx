/**
 * Tidal / Strudel 音乐设计单页：左侧编辑器 + 播放，右侧 AIChat。
 * 依赖 @strudel/web（AGPL-3.0），见 src/musicDesign/README.md。
 *
 * AI 系统提示：agentKey="music" → musicAgent.basePrompt ← SKILL/tidal-cycles/SKILL.md（构建时 raw 导入）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { App, Button, Flex, Space, Splitter, Typography } from 'antd';
import { RollbackOutlined } from '@ant-design/icons';

import { AIChat, type AIChatSidePanelHandle } from '@/components/AIChat';
import { useConfigSubscribe } from '@/contexts/ConfigContext';
import { TidalCodeEditor } from '@/musicDesign/components/TidalCodeEditor';
import { StrudelPlayer } from '@/musicDesign/components/StrudelPlayer';
import { StrudelPlaybackProvider, useStrudelPlayback } from '@/musicDesign/strudelPlayback/useStrudelPlayback';
import { useMusicPatternApply } from '@/musicDesign/hooks/useMusicPatternApply';
import { buildMusicFunctionCalls } from '@/musicDesign/AITools/musicFunctionCalls';
import { buildMusicProjectPrompt } from '@/musicDesign/prompts/musicProjectPrompt';
import { DEFAULT_STRUDEL_CODE, PIANO_STRUDEL_CODE } from '@/musicDesign/constants/defaultPatterns';
import { strudelLocalSamplesBaseUrl } from '@/musicDesign/strudelPlayback/loadStrudelLocalSamples';
import {
  DEFAULT_CPS,
  loadMusicWorkspace,
  saveMusicWorkspace,
} from '@/musicDesign/storage/musicWorkspaceStorage';
import { filterMusicDesignChatModels } from '@/musicDesign/utils/musicDesignChatModels';
import '@ant-design/x-markdown/themes/dark.css';
import './MusicDesignPage.css';

const { Text } = Typography;

const SAVE_DEBOUNCE_MS = 400;

export default function MusicDesignPage() {
  return (
    <StrudelPlaybackProvider scopeId="music-design">
      <MusicDesignWorkbench />
    </StrudelPlaybackProvider>
  );
}

function MusicDesignWorkbench() {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const config = useConfigSubscribe();
  const allModels = config?.models ?? [];
  const chatModels = useMemo(() => filterMusicDesignChatModels(allModels), [allModels]);
  const chatRef = useRef<AIChatSidePanelHandle | null>(null);

  const initial = useMemo(() => loadMusicWorkspace(), []);
  const [code, setCode] = useState(initial?.code ?? DEFAULT_STRUDEL_CODE);
  const codeRef = useRef(code);
  codeRef.current = code;
  const [cps, setCps] = useState(initial?.cps ?? DEFAULT_CPS);
  const [cycleCount, setCycleCount] = useState(1);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { state: playbackState, play, setVolume } = useStrudelPlayback();
  const volumeRestoredRef = useRef(false);

  useEffect(() => {
    if (!playbackState.ready || volumeRestoredRef.current) return;
    volumeRestoredRef.current = true;
    if (typeof initial?.volume === 'number') {
      setVolume(initial.volume);
    }
  }, [initial?.volume, playbackState.ready, setVolume]);

  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveMusicWorkspace({ code, cps, volume: playbackState.volume });
    }, SAVE_DEBOUNCE_MS);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [code, cps, playbackState.volume]);

  const { applyAndPlay, onAssistStream } = useMusicPatternApply({
    setCode,
    cps,
    cycleCount,
    engineReady: playbackState.ready,
    playPattern: play,
    chatRef,
    message,
    streamPreview: false,
  });

  const onPatternSetFromTool = useCallback(
    async (next: string, autoPlay: boolean) => {
      if (autoPlay) {
        await applyAndPlay(next);
      } else {
        setCode(next);
      }
    },
    [applyAndPlay],
  );

  const extraFunctionCalls = useMemo(
    () =>
      buildMusicFunctionCalls({
        getCurrentCode: () => codeRef.current,
        onPatternSet: onPatternSetFromTool,
      }),
    [onPatternSetFromTool],
  );

  const playbackHint = useMemo(() => {
    if (playbackState.busy) return '上一次操作：正在 evaluate / 播放';
    if (playbackState.phase === 'playing') return '上一次操作：播放中';
    if (playbackState.phase === 'paused') return '上一次操作：已暂停';
    return null;
  }, [playbackState.busy, playbackState.phase]);

  const projectPrompt = useMemo(
    () =>
      buildMusicProjectPrompt({
        code,
        cps,
        isPlayingHint: playbackHint,
      }),
    [code, cps, playbackHint],
  );

  const handlePlay = useCallback(async () => {
    if (!playbackState.ready) {
      message.warning('Strudel 引擎尚未就绪');
      return;
    }
    if (!code.trim()) {
      message.warning('请先输入 Strudel 代码');
      return;
    }
    try {
      await play({ code, cps, cycleCount });
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e));
    }
  }, [code, cps, cycleCount, message, play, playbackState.ready]);

  return (
    <div className="music-design-workbench">
      <header className="music-design-topbar">
        <Space orientation="horizontal" size={12} wrap>
          <Button type="text" icon={<RollbackOutlined />} onClick={() => navigate(-1)}>
            返回
          </Button>
          <Text strong>Tidal / Strudel 工作台</Text>
          <Button size="small" onClick={() => setCode(DEFAULT_STRUDEL_CODE)}>
            载入示例
          </Button>
          <Button
            size="small"
            disabled={!playbackState.ready}
            onClick={() => {
              setCode(PIANO_STRUDEL_CODE);
              message.success(`已载入钢琴示例（采样服务 ${strudelLocalSamplesBaseUrl()}）`);
            }}
          >
            钢琴示例
          </Button>
          <Button
            size="small"
            onClick={() => {
              setCode('// 空白\n');
              message.info('已清空，可开始输入或让 AI 生成');
            }}
          >
            清空
          </Button>
        </Space>
      </header>

      <div className="music-design-body">
        <Splitter style={{ height: '100%', minHeight: 0 }} orientation="horizontal">
          <Splitter.Panel defaultSize="58%" min="36%">
            <Flex vertical style={{ height: '100%', minHeight: 0, padding: 12, gap: 4 }}>
              <TidalCodeEditor value={code} onChange={setCode} onRun={handlePlay} height="calc(100vh - 126px)" />
              <StrudelPlayer
                code={code}
                cps={cps}
                onCpsChange={setCps}
                cycleCount={cycleCount}
                onCycleCountChange={setCycleCount}
              />
            </Flex>
          </Splitter.Panel>
          <Splitter.Panel defaultSize="42%" min={300} max={640} className="music-design-ai-pane">
            <AIChat
              ref={chatRef}
              mode="SidePanel"
              agentKey="music"
              enableReasoning={true}
              allowAgentSwitch={true}
              models={chatModels}
              projectPrompt={projectPrompt}
              extraFunctionCalls={extraFunctionCalls}
              storageKeySuffix="music-design"
              onAssistStream={onAssistStream}
              toolsDeclarationList={['music_patch_pattern', 'music_set_pattern']}
              suppressAgentSenderWelcome
              suppressSenderAgentSkill
              senderPlaceholder="描述风格、节奏、乐器或如何修改当前代码…"
              disableAttachmentsHeader
            />
          </Splitter.Panel>
        </Splitter>
      </div>
    </div>
  );
}
