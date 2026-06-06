import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Dropdown, Empty, Flex, Space, Typography, Alert, Tooltip } from 'antd';
import type { MenuProps } from 'antd';
import {
  PlayCircleOutlined,
  PauseCircleOutlined,
  ReloadOutlined,
  LoadingOutlined,
  DownOutlined,
  PlusOutlined,
  DownloadOutlined,
} from '@ant-design/icons';
import { getEnabledEffects } from '@/audiobook/utils/voiceEffects';
import type { Script } from '@/constants/Script';
import type { AudiobookEpisode } from '@/constants/Audiobook';
import type { SegmentAttachedAudio } from '@/constants/Audiobook';
import type {
  AudiobookOutlineVoiceSamples,
  NovelEpisode,
  NovelWorkspaceSnapshot,
} from '@/novelDesign/storage/novelWorkspaceStorage';
import type { NovelWorkspaceItem } from '@/novelDesign/types/novelWorkspace';
import { episodeAudiobookHasContent } from '@/audiobook/utils/audiobookModel';
import {
  getSegmentAttachedAudio,
  isTextTtsAudiobookSegment,
} from '@/audiobook/utils/audiobookAttachedAudio';
import { useConfigSubscribe } from '@/contexts/ConfigContext';
import { buildAudiobookTtsSelectOptions } from '@/audiobook/utils/audiobookTtsModelOptions';
import { AudiobookSegmentCard } from './AudiobookSegmentCard';
import { AudiobookSegmentAttachedAudioModal } from './AudiobookSegmentAttachedAudioModal';
import { AudiobookSegmentAttachedAudioTags } from './AudiobookSegmentAttachedAudioTags';
import {
  AudiobookAddSegmentModal,
  type AudiobookAddSegmentFormValues,
} from './AudiobookAddSegmentModal';
import type { useAudiobookPlayback } from '@/audiobook/hooks/useAudiobookPlayback';

const { Text } = Typography;

export type AudiobookEpisodePlayback = ReturnType<typeof useAudiobookPlayback>;

interface AudiobookEpisodePanelProps {
  episodeAudiobook: AudiobookEpisode | undefined;
  /** 由页面级 useAudiobookPlayback 注入，避免面板重挂载丢失播放态 */
  playback: AudiobookEpisodePlayback;
  episodeTitle?: string;
  /** 当前集元数据（导出文件名等） */
  exportNovelEpisode?: NovelEpisode;
  workspace?: NovelWorkspaceSnapshot;
  novelListItem?: NovelWorkspaceItem | null;
  onGenerateAudiobook?: () => void;
  /** 已向 AI 派发「生成有声书」指令过程中为 true，防止重复点击 */
  generateAudiobookPending?: boolean;
  /** 有声书片段单选（Sender refIndicator）；整集播放起点 */
  selectedSegmentIndex?: number | null;
  onSegmentSelect?: (index: number) => void;
  /** 选中片段编辑 TTS 文本：保存 workspace 并清除该段 TTS 缓存 */
  onSegmentTextChange?: (index: number, text: string) => void;
  /** 选中片段编辑风格指令（voice.tone），blur 时保存 */
  onSegmentToneBlurSave?: (index: number, tone: string) => void;
  /** 片段音效变更 */
  onSegmentVoiceEffectChange?: (index: number, effectKey: string | undefined) => void;
  /** 片段 AI 快捷提示（润色 / 重写 TTS） */
  onSegmentAiPrompt?: (index: number, promptKey: string) => void;
  onSegmentDelete?: (index: number) => void;
  onInsertSegment?: (insertAtIndex: number, values: AudiobookAddSegmentFormValues) => void;
  onAttachedAudioSave?: (segmentIndex: number, item: SegmentAttachedAudio) => void;
  onAttachedAudioDelete?: (segmentIndex: number, itemId: string) => void;
  activeAttachedAudioKeys?: string[];
  novelScript?: Script | null;
  outlineVoice?: AudiobookOutlineVoiceSamples;
}

/** 播放时当前片段滚入视口，距滚动区域顶部保留 20px */
const SEGMENT_SCROLL_TOP_OFFSET_PX = 20;

function scrollSegmentToContainerTop(container: HTMLElement, segmentEl: HTMLElement) {
  const top =
    segmentEl.getBoundingClientRect().top -
    container.getBoundingClientRect().top +
    container.scrollTop -
    SEGMENT_SCROLL_TOP_OFFSET_PX;
  container.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
}

export function AudiobookEpisodePanel({
  episodeAudiobook,
  playback,
  episodeTitle,
  exportNovelEpisode,
  workspace,
  novelListItem,
  onGenerateAudiobook,
  generateAudiobookPending,
  selectedSegmentIndex,
  onSegmentSelect,
  onSegmentTextChange,
  onSegmentToneBlurSave,
  onSegmentVoiceEffectChange,
  onSegmentAiPrompt,
  onSegmentDelete,
  onInsertSegment,
  onAttachedAudioSave,
  onAttachedAudioDelete,
  activeAttachedAudioKeys,
  novelScript,
  outlineVoice,
}: AudiobookEpisodePanelProps) {
  const config = useConfigSubscribe();
  const ttsSelectOptions = useMemo(() => buildAudiobookTtsSelectOptions(config), [config]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const segmentAnchorRefs = useRef<(HTMLDivElement | null)[]>([]);

  const [attachedModalOpen, setAttachedModalOpen] = useState(false);
  const [attachedModalSegmentIndex, setAttachedModalSegmentIndex] = useState<number | null>(null);
  const [attachedModalEditing, setAttachedModalEditing] = useState<SegmentAttachedAudio | null>(null);
  const [addSegmentModalOpen, setAddSegmentModalOpen] = useState(false);
  const [addSegmentAnchorIndex, setAddSegmentAnchorIndex] = useState<number | null>(null);

  const openAddMusicEffect = useCallback((segmentIndex: number) => {
    setAttachedModalSegmentIndex(segmentIndex);
    setAttachedModalEditing(null);
    setAttachedModalOpen(true);
  }, []);

  const openEditMusicEffect = useCallback((segmentIndex: number, item: SegmentAttachedAudio) => {
    setAttachedModalSegmentIndex(segmentIndex);
    setAttachedModalEditing(item);
    setAttachedModalOpen(true);
  }, []);

  const closeAttachedModal = useCallback(() => {
    setAttachedModalOpen(false);
    setAttachedModalSegmentIndex(null);
    setAttachedModalEditing(null);
  }, []);

  const {
    episodePlaybackPhase,
    playingEpisodeSegmentIndex,
    ttsReady,
    getSegmentTtsModelKey,
    changeSegmentTtsModelAndGenerate,
    isSegmentCached,
    getSegmentTtsObjectUrl,
    getSegmentCacheKey,
    isSegmentGenerating,
    generateSegmentAt,
    playEpisode,
    pauseEpisode,
    alignPausedPlaybackCursor,
    resumeEpisode,
    restartEpisode,
    downloadEpisodeAsAudio,
    exportingEpisode,
  } = playback;

  /** 空闲起播 / 下拉菜单：选中片段，否则第 1 段 */
  const resolveIdlePlayStartIndex = useCallback((): number => {
    const total = episodeAudiobook?.segments.length ?? 0;
    if (
      selectedSegmentIndex != null &&
      selectedSegmentIndex >= 0 &&
      selectedSegmentIndex < total
    ) {
      return selectedSegmentIndex;
    }
    return 0;
  }, [episodeAudiobook?.segments.length, selectedSegmentIndex]);

  /** 继续播放：一律以当前选中片段为准（无选中则从第 1 段），不用暂停时的停止序号 */
  const resolveResumeStartIndex = useCallback((): number => {
    const total = episodeAudiobook?.segments.length ?? 0;
    if (
      selectedSegmentIndex != null &&
      selectedSegmentIndex >= 0 &&
      selectedSegmentIndex < total
    ) {
      return selectedSegmentIndex;
    }
    return 0;
  }, [episodeAudiobook?.segments.length, selectedSegmentIndex]);

  const episodePlayMoreMenu: MenuProps = useMemo(
    () => ({
      items: [
        { key: 'regenerateAll', label: '全部重新生成并播放' },
        { key: 'dialogueOnly', label: '只朗读对白' },
      ],
      onClick: ({ key }) => {
        const start = resolveIdlePlayStartIndex();
        if (key === 'regenerateAll') playEpisode(start, { mode: 'regenerateAll' });
        else if (key === 'dialogueOnly') playEpisode(start, { mode: 'dialogueOnly' });
      },
    }),
    [resolveIdlePlayStartIndex, playEpisode],
  );

  useEffect(() => {
    if (episodePlaybackPhase !== 'playing' || playingEpisodeSegmentIndex == null) return;
    const container = scrollRef.current;
    const el = segmentAnchorRefs.current[playingEpisodeSegmentIndex];
    if (!container || !el) return;
    scrollSegmentToContainerTop(container, el);
  }, [episodePlaybackPhase, playingEpisodeSegmentIndex]);

  /** 进入暂停后：「播放在」光标跟当前选中片段对齐（继续播放将从此段起） */
  useEffect(() => {
    if (episodePlaybackPhase !== 'paused') return;
    alignPausedPlaybackCursor(resolveResumeStartIndex());
  }, [
    episodePlaybackPhase,
    selectedSegmentIndex,
    alignPausedPlaybackCursor,
    resolveResumeStartIndex,
  ]);

  if (!episodeAudiobookHasContent(episodeAudiobook)) {
    return (
      <Flex align="center" justify="center" style={{ flex: 1, minHeight: 0, padding: 24 }}>
        {onGenerateAudiobook ?
          <Button
            type="primary"
            size="large"
            disabled={generateAudiobookPending}
            icon={generateAudiobookPending ? <LoadingOutlined /> : undefined}
            onClick={() => onGenerateAudiobook()}
          >
            生成有声书
          </Button>
        : <Empty description="暂无有声书片段" />}
      </Flex>
    );
  }

  const ep = episodeAudiobook!;
  const segments = ep.segments;
  segmentAnchorRefs.current.length = segments.length;

  const segmentPlaybackActive = (i: number) =>
    (episodePlaybackPhase === 'playing' || episodePlaybackPhase === 'paused') &&
    playingEpisodeSegmentIndex === i;

  return (
    <Flex vertical style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
      <div style={{ padding: '8px 12px', flexShrink: 0 }}>
        {episodeTitle ?
          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
            {episodeTitle} · 共 {segments.length} 段
          </Text>
        : null}
        {!ttsReady ?
          <Alert
            type="warning"
            showIcon
            title="请先在设置中启用本地 TTS 并配置模型路径，或添加带「生成配音」能力的模型（如小米 MiMo TTS）。"
            style={{ marginBottom: 8 }}
          />
        : null}
        <Space wrap align="center">
          {episodePlaybackPhase === 'idle' ?
            <>
              <Space.Compact>
                <Button
                  type="primary"
                  icon={<PlayCircleOutlined />}
                  disabled={!ttsReady}
                  onClick={() => playEpisode(resolveIdlePlayStartIndex())}
                >
                  播放整集
                </Button>
                <Dropdown menu={episodePlayMoreMenu} disabled={!ttsReady} trigger={['click']}>
                  <Button type="primary" icon={<DownOutlined />} aria-label="更多播放选项" />
                </Dropdown>
              </Space.Compact>
              <Button
                icon={exportingEpisode ? <LoadingOutlined /> : <DownloadOutlined />}
                disabled={!ttsReady || exportingEpisode || !exportNovelEpisode || !workspace}
                onClick={() => {
                  if (!exportNovelEpisode || !workspace) return;
                  void downloadEpisodeAsAudio(exportNovelEpisode, workspace, novelListItem);
                }}
              >
                下载为音频文件
              </Button>
            </>
          : null}
          {episodePlaybackPhase === 'playing' ?
            <Button type="primary" danger icon={<PauseCircleOutlined />} onClick={() => pauseEpisode()}>
              停止播放
            </Button>
          : null}
          {episodePlaybackPhase === 'paused' ?
            <>
              <Button
                type="primary"
                icon={<PlayCircleOutlined />}
                onClick={() => resumeEpisode(resolveResumeStartIndex())}
              >
                继续播放
              </Button>
              <Button icon={<ReloadOutlined />} onClick={() => restartEpisode(0)}>
                重新播放
              </Button>
            </>
          : null}
        </Space>
      </div>
      <div
        ref={scrollRef}
        style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '0 12px 12px' }}
      >
        <Space orientation="vertical" style={{ width: '100%' }} size={8}>
          {segments.map((seg, i) => (
            <div
              key={`seg_${i}`}
              ref={(node) => {
                segmentAnchorRefs.current[i] = node;
              }}
              className='audiobook-segment-container'
              style={{ width: '100%', position: 'relative' }}
            >
              <div style={{ marginRight: 86 }}>
                <AudiobookSegmentCard
                  segment={seg}
                  index={i}
                  hasTtsCache={isSegmentCached(i)}
                ttsPreviewSrc={getSegmentTtsObjectUrl(i)}
                enabledEffectKeys={getEnabledEffects({
                  innerMonologue: workspace?.innerMonologueEnabled,
                  spaceEcho: workspace?.spaceEchoEnabled,
                  telephone: workspace?.telephoneEnabled,
                  muffler: workspace?.mufflerEnabled,
                })}
                ttsCacheKey={getSegmentCacheKey(i)}
                ttsModelKey={getSegmentTtsModelKey(i)}
                onTtsModelKeyChange={(key) => void changeSegmentTtsModelAndGenerate(i, key)}
                ttsModelOptions={ttsSelectOptions}
                generating={isSegmentGenerating(i)}
                onGenerate={() => void generateSegmentAt(i)}
                selected={selectedSegmentIndex === i}
                episodePlaybackActive={segmentPlaybackActive(i)}
                onCardSelect={onSegmentSelect ? () => onSegmentSelect(i) : undefined}
                onTextChange={
                  selectedSegmentIndex === i && onSegmentTextChange ?
                    (text) => onSegmentTextChange(i, text)
                  : undefined
                }
                onToneBlurSave={
                  selectedSegmentIndex === i && onSegmentToneBlurSave ?
                    (tone) => onSegmentToneBlurSave(i, tone)
                  : undefined
                }
                novelScript={novelScript}
                outlineVoice={outlineVoice}
                onRunAiPrompt={
                  onSegmentAiPrompt ? (promptKey) => onSegmentAiPrompt(i, promptKey) : undefined
                }
                onDelete={onSegmentDelete ? () => onSegmentDelete(i) : undefined}
                onVoiceEffectChange={onSegmentVoiceEffectChange ? (key) => onSegmentVoiceEffectChange(i, key) : undefined}
              />
              </div>
              {isTextTtsAudiobookSegment(seg) && (onAttachedAudioSave || onInsertSegment) ?
                <div style={{ position: 'absolute', top: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                  {onInsertSegment ?
                    <Tooltip title="添加片段">
                      <Button
                        type="primary"
                        shape="circle"
                        className="audiobook-segment-audio-add-button"
                        size="small"
                        icon={<PlusOutlined />}
                        onClick={() => {
                          setAddSegmentAnchorIndex(i);
                          setAddSegmentModalOpen(true);
                        }}
                        style={{ marginBottom: 5, marginTop: 5 }}
                      />
                    </Tooltip>
                  : null}
                  {onAttachedAudioSave ?
                    <Tooltip title="添加音乐/音效">
                      <Button
                        type="primary"
                        shape="circle"
                        className='audiobook-segment-audio-add-button'
                        size="small"
                        icon={<i className='iconfont'>&#xe64c;</i>}
                        onClick={() => openAddMusicEffect(i)}
                        style={{ marginBottom: 5, marginTop: onInsertSegment ? 0 : 5 }}
                      />
                    </Tooltip>
                  : null}

                  {onAttachedAudioSave ?
                    <AudiobookSegmentAttachedAudioTags
                      segmentIndex={i}
                      items={getSegmentAttachedAudio(seg)}
                      activeAttachedAudioKeys={activeAttachedAudioKeys}
                      onEdit={(item) => openEditMusicEffect(i, item)}
                    />
                  : null}
                  
                </div>
              : null}
            </div>
          ))}
        </Space>
      </div>

      {onAttachedAudioSave && onAttachedAudioDelete ?
        <AudiobookSegmentAttachedAudioModal
          open={attachedModalOpen}
          segmentIndex={attachedModalSegmentIndex}
          editing={attachedModalEditing}
          aiConfig={config}
          onClose={closeAttachedModal}
          onSave={onAttachedAudioSave}
          onDelete={onAttachedAudioDelete}
        />
      : null}
      {onInsertSegment ?
        <AudiobookAddSegmentModal
          open={addSegmentModalOpen}
          segmentIndex={addSegmentAnchorIndex}
          novelScript={novelScript}
          onClose={() => {
            setAddSegmentModalOpen(false);
            setAddSegmentAnchorIndex(null);
          }}
          onSubmit={(anchorIndex, values) => {
            const insertAt = values.position === 'above' ? anchorIndex : anchorIndex + 1;
            onInsertSegment(insertAt, values);
          }}
        />
      : null}
    </Flex>
  );
}
